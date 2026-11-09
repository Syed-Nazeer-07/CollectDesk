import jwt from 'jsonwebtoken';
import {User} from './models.js';

export const COOKIE_NAME = 'collectdesk_session';
export function cookieOptions() {
  return {httpOnly:true, secure: process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:8*60*60*1000};
}
export function publicUser(user) {return {id:String(user._id),name:user.name,email:user.email,role:user.role,organizationId:user.organizationId?String(user.organizationId):null};}
export function issueSession(user) {
  return jwt.sign({sub:String(user._id),ver:user.sessionVersion??0},process.env.JWT_SECRET,{expiresIn:'8h',algorithm:'HS256'});
}
export async function requireAuth(req,res,next) {
  try {
    const token=req.cookies?.[COOKIE_NAME];
    if(!token) return res.status(401).json({error:'Please sign in.'});
    const payload=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256']});
    const user=await User.findById(payload.sub).lean();
    if(!user?.active || (payload.ver??0)!==(user.sessionVersion??0)) return res.status(401).json({error:'Session expired. Please sign in again.'});
    req.user=user;
    next();
  } catch {res.status(401).json({error:'Session expired. Please sign in again.'});}
}
export function requireRole(...roles){return(req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({error:'You do not have permission to perform this action.'});}
