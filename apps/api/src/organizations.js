import {createHash,randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import {Organization,OrganizationInvite,OrganizationEvent,User} from './models.js';
import {COOKIE_NAME,cookieOptions,issueSession,publicUser,requireRole} from './auth.js';
import {emailDeliveryProvider,sendOrganizationInviteEmail} from './email-delivery.js';
import {transactionalLedger} from './financial-write.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const inviteToken=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const email=z.email().max(254).transform(value=>value.toLowerCase());
const limit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many invitation attempts. Try again shortly.'}});
const activation=z.object({
  token:inviteToken,
  name:z.string().trim().min(2).max(90),
  password:z.string().min(12).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/)
    .refine(value=>Buffer.byteLength(value)<=72,'Password must fit within 72 UTF-8 bytes.')
}).strict();

const canInvite=()=>transactionalLedger() && Boolean(emailDeliveryProvider());
const orgView=organization=>({id:String(organization._id),name:organization.name,country:organization.country});
const memberView=member=>({id:String(member._id),name:member.name,email:member.email,
  organizationRole:member.organizationRole || 'member',active:member.active});
const inviteView=invite=>({id:String(invite._id),email:invite.email,
  status:invite.status==='pending' && invite.expiresAt<=new Date() ? 'expired' : invite.status,
  expiresAt:invite.expiresAt});

function ownerOnly(req,res,next){
  if (req.user.role!=='creditor' || req.user.organizationRole!=='owner' || !req.user.organizationId)
    return res.status(403).json({error:'Only the organization owner can manage membership.'});
  next();
}

export function installOrganizationRoutes(app, route, origin) {
  route.get('/organizations',requireRole('admin'),async(req,res)=>{
    const {page}=z.object({page:z.coerce.number().int().min(1).max(200).default(1)}).strict().parse(req.query);
    const rows=await Organization.find().sort({_id:1}).skip((page-1)*25).limit(26).lean();
    res.json({organizations:rows.slice(0,25).map(orgView),hasMore:rows.length>25});
  });

  route.get('/organization',requireRole('creditor'),async(req,res)=>{
    const organization=await Organization.findById(req.user.organizationId).lean();
    if (!organization) return res.status(404).json({error:'Organization not found.'});
    const owner=req.user.organizationRole==='owner';
    const [members,invitations,history]=owner ? await Promise.all([
      User.find({role:'creditor',organizationId:organization._id}).sort({active:-1,name:1,_id:1})
        .select('name email organizationRole active').limit(100).lean(),
      OrganizationInvite.find({organizationId:organization._id}).sort({_id:-1}).limit(50).lean(),
      OrganizationEvent.find({organizationId:organization._id}).sort({_id:-1}).limit(25)
        .select('kind createdAt detail').lean()
    ]) : [[],[],[]];
    res.json({organization:orgView(organization),owner,canInvite:owner && canInvite(),
      members:members.map(memberView),invitations:invitations.map(inviteView),history});
  });

  route.patch('/organization',ownerOnly,async(req,res)=>{
    const {name}=z.object({name:z.string().trim().min(3).max(120)}).strict().parse(req.body);
    const organization=await Organization.findOneAndUpdate(
      {_id:req.user.organizationId,active:true}, {$set:{name}},
      {returnDocument:'after'}
    ).lean();
    if (!organization) return res.status(404).json({error:'Organization not found.'});
    res.json({organization:orgView(organization)});
  });

  route.post('/organization/invitations',ownerOnly,limit,async(req,res)=>{
    if (!canInvite()) return res.status(503).json({error:'Invitations require transactional storage and an email sender.'});
    const input=z.object({email}).strict().parse(req.body);
    const organization=await Organization.findOne({_id:req.user.organizationId,active:true}).lean();
    if (!organization) return res.status(404).json({error:'Organization not found.'});
    if (await User.exists({email:input.email}))
      return res.status(409).json({error:'This email already has a CollectDesk account.'});
    const scope={organizationId:organization._id,email:input.email,status:'pending'};
    await OrganizationInvite.updateMany({...scope,expiresAt:{$lte:new Date()}},{$set:{status:'revoked'}});
    const token=randomBytes(32).toString('base64url');
    let invite;
    try {
      invite=await OrganizationInvite.create({...scope,tokenHash:hash(token),
        invitedBy:req.user._id,expiresAt:new Date(Date.now()+86_400_000)});
    } catch (error) {
      if (error.code===11000) return res.status(409).json({error:'An active invitation already exists.'});
      throw error;
    }
    try {
      await sendOrganizationInviteEmail(input.email,origin+'/organization/join#token='+token);
    } catch {
      await OrganizationInvite.updateOne({_id:invite._id,status:'pending'},{$set:{status:'revoked'}});
      return res.status(503).json({error:'Invitation delivery could not be confirmed. Try again.'});
    }
    res.status(201).json({invitation:inviteView(invite)});
  });

  route.post('/organization/invitations/:id/revoke',ownerOnly,async(req,res)=>{
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({error:'Invitation not found.'});
    const updated=await OrganizationInvite.updateOne(
      {_id:req.params.id,organizationId:req.user.organizationId,status:'pending'},
      {$set:{status:'revoked'}}
    );
    if (!updated.matchedCount) return res.status(404).json({error:'Pending invitation not found.'});
    res.json({ok:true});
  });

  route.post('/organization/members/:id/deactivate',ownerOnly,async(req,res)=>{
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({error:'Member not found.'});
    const updated=await User.updateOne({_id:req.params.id,organizationId:req.user.organizationId,
      role:'creditor',organizationRole:{$ne:'owner'},active:true}, {
      $set:{active:false,deactivatedBy:req.user._id,deactivatedAt:new Date()},$inc:{sessionVersion:1}
    });
    if (!updated.matchedCount) return res.status(404).json({error:'Active member not found.'});
    res.json({ok:true});
  });

  app.post('/api/v1/auth/organization-invite/accept',limit,async(req,res)=>{
    if (!transactionalLedger()) return res.status(503).json({error:'Organization activation is paused.'});
    const input=activation.parse(req.body);
    const criteria={tokenHash:hash(input.token),status:'pending',expiresAt:{$gt:new Date()}};
    if (!await OrganizationInvite.exists(criteria)) return res.status(400).json({error:'Invitation is no longer valid.'});
    const passwordHash=await bcrypt.hash(input.password,12);
    let user;
    try {
      user=await mongoose.connection.transaction(async session=>{
        const invite=await OrganizationInvite.findOneAndUpdate({...criteria,expiresAt:{$gt:new Date()}},
          {$set:{status:'accepted',acceptedAt:new Date()}},{returnDocument:'after',session});
        if (!invite) return null;
        const organization=await Organization.exists({_id:invite.organizationId,active:true}).session(session);
        if (!organization) throw new Error('Organization unavailable');
        const member=await new User({name:input.name,email:invite.email,passwordHash,
          role:'creditor',organizationId:invite.organizationId,organizationRole:'member'}).save({session});
        await new OrganizationEvent({organizationId:invite.organizationId,actorId:member._id,
          kind:'member_joined',detail:member.name}).save({session});
        return member;
      },{writeConcern:{w:'majority'}});
    } catch (error) {
      if (error.code===11000) return res.status(409).json({error:'This email already has a CollectDesk account.'});
      throw error;
    }
    if (!user) return res.status(400).json({error:'Invitation is no longer valid.'});
    res.cookie(COOKIE_NAME,issueSession(user),cookieOptions());
    res.status(201).json({user:publicUser(user)});
  });
}
