/**
 * One-time email password recovery. The same mail providers as verified signup
 * are supported, without permitting public role assignment or account lookup.
 */
import {createHash,randomBytes} from 'node:crypto';
import {rateLimit} from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import mongoose from 'mongoose';
import {newPassword} from './new-password.js';
import {transactionalLedger} from './financial-write.js';
import {PasswordReset,User} from './models.js';
import {emailDeliveryProvider,sendPasswordResetEmail} from './email-delivery.js';

const requestLimiter=rateLimit({
  windowMs:60*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many recovery requests. Please try again later.'}
});
const resetLimiter=rateLimit({
  windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many reset attempts. Please try again later.'}
});
const tokenHash=token=>createHash('sha256').update(token).digest('hex');

export function installPasswordRecoveryRoutes(app,webOrigin){
  // Recovery works for existing users even if NEW public registration is disabled.
  app.get('/api/v1/auth/password/options',(_req,res)=>{
    res.set('Cache-Control','no-store');
    res.json({enabled:emailDeliveryProvider()!==null});
  });

  app.post('/api/v1/auth/password/forgot',requestLimiter,async(req,res)=>{
    if(!emailDeliveryProvider())return res.status(503).json({
      error:'Password recovery is not configured. Please contact your workspace administrator.'
    });
    const {email}=z.object({
      email:z.email().max(254).transform(v=>v.toLowerCase())
    }).strict().parse(req.body);
    const reply={message:'If an eligible account exists, a password reset link will be sent.'};
    const user=await User.findOne({email,active:true}).select('_id email').lean();
    if(!user)return res.status(202).json(reply);

    const token=randomBytes(32).toString('base64url');
    // New links replace the prior link using one atomic record per user.
    // Legacy records used an independently generated _id.
    await PasswordReset.deleteMany({userId:user._id,_id:{$ne:user._id}});
    const hash=tokenHash(token);
    await PasswordReset.updateOne({_id:user._id},{
      $set:{userId:user._id,tokenHash:hash,expiresAt:new Date(Date.now()+30*60*1000)}
    },{upsert:true});
    try{
      await sendPasswordResetEmail(user.email,
        webOrigin+'/reset-password?token='+encodeURIComponent(token));
    }catch{
      await PasswordReset.deleteOne({_id:user._id,tokenHash:hash});
      // Respond identically for existing/nonexistent addresses to prevent enumeration.
      console.error('[Auth] Password recovery mail delivery failed');
    }
    return res.status(202).json(reply);
  });

  app.post('/api/v1/auth/password/reset',resetLimiter,async(req,res)=>{
    const input=z.object({token:z.string().min(30).max(150),password:newPassword}).strict().parse(req.body);
    const hash=tokenHash(input.token);
    if(!await PasswordReset.exists({tokenHash:hash,expiresAt:{$gt:new Date()}}))
      return res.status(400).json({error:'This password reset link has expired or was already used. Request a new one.'});
    const passwordHash=await bcrypt.hash(input.password,12);
    const reset=async session=>{
      const pending=await PasswordReset.findOneAndDelete({tokenHash:hash,expiresAt:{$gt:new Date()}},{session});
      if(!pending)return null;
      return User.findOneAndUpdate({_id:pending.userId,active:true},{
        $set:{passwordHash},$inc:{sessionVersion:1}
      },{returnDocument:'after',session});
    };
    const user=transactionalLedger()
      ? await mongoose.connection.transaction(reset,{writeConcern:{w:'majority'}})
      : await reset(null);
    if(!user)return res.status(400).json({error:'This password reset link is no longer valid.'});
    res.set('Cache-Control','no-store');
    return res.json({ok:true,message:'Password changed. Please sign in again.'});
  });
}
