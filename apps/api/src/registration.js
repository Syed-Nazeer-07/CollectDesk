/**
 * Self-service creditor authentication for CollectDesk.
 *
 * Default-deny: public account creation requires explicit enablement and a
 * working email sender or Google client configuration. It never grants staff
 * roles. These endpoints are for the isolated demo, not real debtors or money.
 */
import {createHash,createPublicKey,randomBytes,verify as verifySignature} from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import {GoogleNonce,Organization,PendingSignup,User} from './models.js';
import {COOKIE_NAME,cookieOptions,issueSession,publicUser,requireAuth} from './auth.js';
import {emailDeliveryProvider,sendVerificationEmail} from './email-delivery.js';

const signupLimiter=rateLimit({
  windowMs:60*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many registration attempts. Try again later.'}
});
const verifyLimiter=rateLimit({
  windowMs:15*60*1000,limit:15,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many verification attempts. Try again later.'}
});
const googleLimiter=rateLimit({
  windowMs:15*60*1000,limit:15,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many sign-in attempts. Try again later.'}
});
const cleanName=z.string().trim().min(2).max(90);
const cleanCompany=z.string().trim().min(3).max(140);
const registrationSchema=z.object({
  name:cleanName,
  organizationName:cleanCompany,
  email:z.email().max(254).transform(e=>e.toLowerCase()),
  password:z.string().min(12).max(128)
    .regex(/[a-z]/,'Use at least one lowercase letter.')
    .regex(/[A-Z]/,'Use at least one uppercase letter.')
    .regex(/[0-9]/,'Use at least one number.')
}).strict();
const hashToken=value=>createHash('sha256').update(value).digest('hex');
const enabled=()=>process.env.PUBLIC_REGISTRATION_ENABLED==='true';
const emailEnabled=()=>enabled()&&emailDeliveryProvider()!==null;
const googleEnabled=()=>enabled()&&!!process.env.GOOGLE_CLIENT_ID;
const nonceCookie='collectdesk_google_nonce';
const nonceCookieOpts=()=>({...cookieOptions(),path:'/api/v1/auth',maxAge:8*60*1000});

function failClosed(res,method){
  return res.status(503).json({error:method+' is not available yet. The workspace owner must configure its identity provider.'});
}

function parseJwtPart(part){
  const body=Buffer.from(part,'base64url').toString('utf8');
  return JSON.parse(body);
}

// Verify Google's signature against Google's public JWKS and enforce audience,
// issuer, expiry, nonce, and verified email. Never trust client-decoded claims.
export async function verifyGoogleIdToken(credential,expectedNonce,clientId,{fetchKeys=fetch}={}){
  if(typeof credential!=='string'||credential.length>12000)throw new Error('Invalid Google credential');
  const sections=credential.split('.');
  if(sections.length!==3)throw new Error('Invalid Google credential');
  const header=parseJwtPart(sections[0]);
  const payload=parseJwtPart(sections[1]);
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||!header.kid ||
    !['accounts.google.com','https://accounts.google.com'].includes(payload.iss) ||
    payload.aud!==clientId || !Number.isInteger(payload.exp) || payload.exp<=now ||
    !Number.isInteger(payload.iat) || payload.iat>now+60 ||
    payload.iat<now-3600 || payload.nonce!==expectedNonce ||
    payload.email_verified!==true ||typeof payload.email!=='string' ||
    !z.email().safeParse(payload.email).success ||
    typeof payload.sub!=='string'||!payload.sub ||payload.sub.length>256){
    throw new Error('Google identity claims could not be verified');
  }
  const jwksResponse=await fetchKeys('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(9000)});
  if(!jwksResponse.ok)throw new Error('Could not fetch Google verification keys');
  const jwks=await jwksResponse.json();
  const key=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig'&&k.alg==='RS256');
  if(!key)throw new Error('No matching Google verification key');
  const signature=Buffer.from(sections[2],'base64url');
  const valid=verifySignature('RSA-SHA256',Buffer.from(sections[0]+'.'+sections[1]),
    createPublicKey({key,format:'jwk'}),signature);
  if(!valid)throw new Error('Google ID token signature mismatch');
  return {sub:payload.sub,email:payload.email.toLowerCase(),name:typeof payload.name==='string'?payload.name.slice(0,90):payload.email.split('@')[0]};
}

export function installRegistrationRoutes(app,webOrigin){
  app.get('/api/v1/auth/options',(_req,res)=>{
    res.set('Cache-Control','no-store');
    res.json({
      emailSignupEnabled:emailEnabled(),
      googleEnabled:googleEnabled(),
      googleClientId:googleEnabled()?process.env.GOOGLE_CLIENT_ID:null
    });
  });

  app.post('/api/v1/auth/register',signupLimiter,async(req,res)=>{
    if(!emailEnabled())return failClosed(res,'Email registration');
    const input=registrationSchema.parse(req.body);
    // Returning the same response for existing users reduces account discovery.
    const response={message:'If this address can register, a verification link will be sent. Please check your inbox.'};
    if(await User.exists({email:input.email}))return res.json(response);
    const token=randomBytes(32).toString('base64url');
    const doc=await PendingSignup.create({
      name:input.name,email:input.email,organizationName:input.organizationName,
      passwordHash:await bcrypt.hash(input.password,12),tokenHash:hashToken(token),
      expiresAt:new Date(Date.now()+30*60*1000)
    });
    try{
      await sendVerificationEmail(input.email,webOrigin+'/signup/verify?token='+encodeURIComponent(token));
    }catch{
      await PendingSignup.deleteOne({_id:doc._id});
      return res.status(503).json({error:'Verification email could not be sent. Please try again later.'});
    }
    res.status(202).json(response);
  });

  app.post('/api/v1/auth/verify-email',verifyLimiter,async(req,res)=>{
    if(!emailEnabled())return failClosed(res,'Email verification');
    const {token}=z.object({token:z.string().min(30).max(150)}).strict().parse(req.body);
    const pending=await PendingSignup.findOneAndDelete({tokenHash:hashToken(token),expiresAt:{$gt:new Date()}});
    if(!pending)return res.status(400).json({error:'This verification link has expired or has already been used.'});
    if(await User.exists({email:pending.email})){
      return res.status(409).json({error:'An account already exists for this email. Sign in instead.'});
    }
    const organization=await Organization.create({name:pending.organizationName,country:'IN'});
    try{
      const user=await User.create({name:pending.name,email:pending.email,
        passwordHash:pending.passwordHash,role:'creditor',organizationId:organization._id,active:true});
      res.cookie(COOKIE_NAME,issueSession(user),cookieOptions());
      return res.status(201).json({user:publicUser(user)});
    }catch(error){
      await Organization.deleteOne({_id:organization._id});
      if(error?.code===11000)return res.status(409).json({error:'This email is already registered.'});
      throw error;
    }
  });

  app.get('/api/v1/auth/google/nonce',googleLimiter,async(_req,res)=>{
    if(!googleEnabled())return failClosed(res,'Google Sign-In');
    const nonce=randomBytes(24).toString('base64url');
    await GoogleNonce.create({nonceHash:hashToken(nonce),expiresAt:new Date(Date.now()+8*60*1000)});
    const signed=jwt.sign({nonce},process.env.JWT_SECRET,{
      algorithm:'HS256',expiresIn:'8m',audience:'collectdesk-google-nonce'
    });
    res.cookie(nonceCookie,signed,nonceCookieOpts());
    res.set('Cache-Control','no-store').json({nonce});
  });

  app.post('/api/v1/auth/google',googleLimiter,async(req,res)=>{
    if(!googleEnabled())return failClosed(res,'Google Sign-In');
    const {credential}=z.object({credential:z.string().min(50).max(12000)}).strict().parse(req.body);
    let signed;
    try{
      signed=jwt.verify(req.cookies?.[nonceCookie],process.env.JWT_SECRET,{
        algorithms:['HS256'],audience:'collectdesk-google-nonce'
      });
    }catch{return res.status(401).json({error:'Google sign-in expired. Please try again.'});}
    res.clearCookie(nonceCookie,{...nonceCookieOpts(),maxAge:undefined});
    const consumed=await GoogleNonce.findOneAndDelete({nonceHash:hashToken(signed.nonce),expiresAt:{$gt:new Date()}});
    if(!consumed)return res.status(401).json({error:'This Google sign-in attempt has already been used. Try again.'});
    let identity;
    try{identity=await verifyGoogleIdToken(credential,signed.nonce,process.env.GOOGLE_CLIENT_ID);}
    catch{return res.status(401).json({error:'Google identity verification failed. Please try again.'});}
    let user=await User.findOne({googleSub:identity.sub,active:true}).select('+googleSub');
    if(!user){
      const existing=await User.findOne({email:identity.email});
      if(existing)return res.status(409).json({error:'An account with this email already exists. Sign in with your password; Google linking is not enabled for existing accounts.'});
      try{
        user=await User.create({
          name:identity.name,email:identity.email,googleSub:identity.sub,
          passwordHash:await bcrypt.hash(randomBytes(48).toString('base64url'),12),
          role:'creditor',active:true
        });
      }catch(error){
        if(error?.code===11000)return res.status(409).json({error:'This account was already registered. Please sign in again.'});
        throw error;
      }
    }
    // Google-created users enter company details before opening the case APIs.
    res.cookie(COOKIE_NAME,issueSession(user),cookieOptions());
    res.json({user:publicUser(user)});
  });

  app.post('/api/v1/auth/organization',requireAuth,async(req,res)=>{
    if(req.user.role!=='creditor'||req.user.organizationId){
      return res.status(409).json({error:'Your account already belongs to a workspace.'});
    }
    if(!enabled())return failClosed(res,'Company onboarding');
    const {organizationName}=z.object({organizationName:cleanCompany}).strict().parse(req.body);
    const org=await Organization.create({name:organizationName,country:'IN'});
    const updated=await User.findOneAndUpdate({
      _id:req.user._id,role:'creditor',organizationId:null
    },{$set:{organizationId:org._id}},{returnDocument:'after'});
    if(!updated){await Organization.deleteOne({_id:org._id});return res.status(409).json({error:'Workspace setup has already been completed.'});}
    res.json({user:publicUser(updated)});
  });
}
