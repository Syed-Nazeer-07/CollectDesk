/**
 * Administrator-issued, one-time operator invitations.
 * Never accepts a role from the browser when activating an invitation.
 * No invitation tokens are returned from admin list/create APIs.
 */
import {createHash,randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import {StaffInvite,User} from './models.js';
import {requireAuth,requireRole,issueSession,cookieOptions,COOKIE_NAME,publicUser} from './auth.js';
import {emailDeliveryProvider,sendStaffInviteEmail} from './email-delivery.js';

const hash=v=>createHash('sha256').update(v).digest('hex');
const inviteLimiter=rateLimit({
  windowMs:60*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many invitation attempts. Try again later.'}
});
const acceptLimiter=rateLimit({
  windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many activation attempts. Try again later.'}
});
const password=z.string().min(12).max(128)
  .regex(/[a-z]/,'Use a lowercase letter.')
  .regex(/[A-Z]/,'Use an uppercase letter.')
  .regex(/[0-9]/,'Use a number.');
const invitation=z.object({
  email:z.email().max(254).transform(x=>x.trim().toLowerCase()),
  role:z.literal('operator')
}).strict();
const acceptance=z.object({
  token:z.string().min(35).max(150),
  name:z.string().trim().min(2).max(90),
  password
}).strict();

export function installStaffRoutes(app,webOrigin) {
  // These endpoints work whether or not public creditor registration is enabled.
  app.get('/api/v1/staff/invitations',requireAuth,requireRole('admin'),async(_req,res)=>{
    const items=await StaffInvite.find().sort({createdAt:-1}).limit(100).lean();
    res.set('Cache-Control','no-store');
    res.json({invitations:items.map(item=>({
      id:String(item._id),email:item.email,role:item.role,status:item.status,
      createdAt:item.createdAt,expiresAt:item.expiresAt,consumedAt:item.consumedAt
    }))});
  });

  app.post('/api/v1/staff/invitations',requireAuth,requireRole('admin'),inviteLimiter,async(req,res)=>{
    if(!emailDeliveryProvider())return res.status(503).json({
      error:'Staff invitations require a configured transactional email provider.'
    });
    const {email,role}=invitation.parse(req.body);
    if(await User.exists({email}))return res.status(409).json({
      error:'This email already has an account. Contact the administrator for access changes.'
    });
    if(await StaffInvite.exists({email,status:'pending',expiresAt:{$gt:new Date()}}))
      return res.status(409).json({error:'An active invitation already exists for this address.'});
    await StaffInvite.deleteMany({email,status:'pending',expiresAt:{$lte:new Date()}});
    const token=randomBytes(32).toString('base64url');
    const pending=await StaffInvite.create({
      email,role,invitedBy:req.user._id,tokenHash:hash(token),
      expiresAt:new Date(Date.now()+24*60*60*1000)
    });
    try{
      await sendStaffInviteEmail(email,webOrigin+'/staff/activate?token='+encodeURIComponent(token));
    }catch{
      await StaffInvite.deleteOne({_id:pending._id,status:'pending'});
      return res.status(503).json({error:'Invitation email could not be delivered. Check sender settings and retry.'});
    }
    res.set('Cache-Control','no-store');
    return res.status(201).json({id:String(pending._id),status:'pending'});
  });

  app.post('/api/v1/staff/invitations/:id/revoke',requireAuth,requireRole('admin'),async(req,res)=>{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(404).json({error:'Invitation not found.'});
    const updated=await StaffInvite.findOneAndUpdate(
      {_id:req.params.id,status:'pending'},{$set:{status:'revoked'}},{new:true}
    );
    if(!updated)return res.status(409).json({error:'This invitation is no longer active.'});
    return res.json({ok:true});
  });

  // A high-entropy token may be looked up without exposing the token via listing.
  app.get('/api/v1/auth/staff-invite',acceptLimiter,async(req,res)=>{
    const {token}=z.object({token:z.string().min(35).max(150)}).strict().parse(req.query);
    const row=await StaffInvite.findOne({
      tokenHash:hash(token),status:'pending',expiresAt:{$gt:new Date()}
    }).select('email role expiresAt').lean();
    res.set('Cache-Control','no-store');
    if(!row)return res.status(404).json({error:'Invitation expired, revoked, or already accepted.'});
    return res.json({email:row.email,role:row.role,expiresAt:row.expiresAt});
  });

  app.post('/api/v1/auth/staff-invite/accept',acceptLimiter,async(req,res)=>{
    const input=acceptance.parse(req.body);
    const tokenHash=hash(input.token);
    const pending=await StaffInvite.findOne({
      tokenHash,status:'pending',expiresAt:{$gt:new Date()}
    }).lean();
    if(!pending)return res.status(400).json({error:'Invitation is no longer valid.'});
    if(await User.exists({email:pending.email}))return res.status(409).json({
      error:'This email already has an account. Sign in instead.'
    });
    const hashedPassword=await bcrypt.hash(input.password,12);
    // Consume the token atomically so two parallel activations cannot both succeed.
    const consumed=await StaffInvite.findOneAndUpdate({
      _id:pending._id,tokenHash,status:'pending',expiresAt:{$gt:new Date()}
    },{$set:{status:'consumed',consumedAt:new Date()}},{new:true});
    if(!consumed)return res.status(400).json({error:'Invitation is no longer valid.'});
    let user;
    try {
      user=await User.create({
        name:input.name,email:consumed.email,
        role:'operator',active:true,passwordHash:hashedPassword
      });
    }catch(error){
      // Re-enable only after an unexpected database error; never re-enable
      // a token that maps to a registered account.
      if(error?.code===11000)return res.status(409).json({error:'This email already has an account.'});
      await StaffInvite.updateOne({_id:consumed._id,status:'consumed'},{$set:{status:'pending',consumedAt:null}});
      throw error;
    }
    res.cookie(COOKIE_NAME,issueSession(user),cookieOptions());
    res.set('Cache-Control','no-store');
    return res.status(201).json({user:publicUser(user)});
  });
}
