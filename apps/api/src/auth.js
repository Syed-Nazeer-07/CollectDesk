import jwt from 'jsonwebtoken';
import {createHash,randomUUID} from 'node:crypto';
import {User,RevokedSession} from './models.js';
const hashSession=token=>createHash('sha256').update(token).digest('hex');
function decodeSession(token){
  const payload=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256']});
  if(typeof payload!=='object'||typeof payload.sub!=='string'||!/^[a-f0-9]{24}$/i.test(payload.sub)||
    !Number.isInteger(payload.exp)||!Number.isInteger(payload.ver??0)||payload.aud)
    throw new Error('Invalid session claims');
  return payload;
}
export async function revokeSession(token){
  if(!token)return;
  let payload;
  try{payload=decodeSession(token);}catch{return;}
  const tokenHash=hashSession(token);
  try{
    await RevokedSession.updateOne({tokenHash},{$setOnInsert:{tokenHash,expiresAt:new Date(payload.exp*1000)}},{upsert:true});
  }catch(error){if(error?.code!==11000)throw error;}
}

export const COOKIE_NAME = 'collectdesk_session';
export function cookieOptions() {
  return {httpOnly:true, secure: process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:8*60*60*1000};
}
export function publicUser(user) {return {id:String(user._id),name:user.name,email:user.email,role:user.role,organizationId:user.organizationId?String(user.organizationId):null};}
export function issueSession(user) {
  return jwt.sign({sub:String(user._id),ver:user.sessionVersion??0},process.env.JWT_SECRET,{expiresIn:'8h',algorithm:'HS256',jwtid:randomUUID()});
}
export async function requireAuth(req,res,next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({error:'Please sign in.'});
  let payload;
  try {
    payload = decodeSession(token);
  } catch {
    return res.status(401).json({error:'Session expired. Please sign in again.'});
  }
  // Express forwards database failures to the API error handler.
  const [user,revoked]=await Promise.all([
    User.findById(payload.sub).lean(),
    RevokedSession.exists({tokenHash:hashSession(token),expiresAt:{$gt:new Date()}})
  ]);
  if (revoked||!user?.active||!['creditor','operator','admin'].includes(user.role) || (payload.ver ?? 0) !== (user.sessionVersion ?? 0))
    return res.status(401).json({error:'Session expired. Please sign in again.'});
  req.user = user;
  next();
}
export function requireRole(...roles){return(req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({error:'You do not have permission to perform this action.'});}
