import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {rateLimit} from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {z, ZodError} from 'zod';
import mongoose from 'mongoose';
import {User,Case,Activity,Receipt} from './models.js';
import {issueSession,publicUser,cookieOptions,COOKIE_NAME,requireAuth,requireRole} from './auth.js';
import {assertAccess,canAssign,canEditDraft,canReview,canSubmit,calculateMoney,REVIEW_DECISIONS,formatCaseCode} from './rules.js';

const app=express();
app.disable('x-powered-by');
app.use(helmet());
const webOrigin=process.env.WEB_ORIGIN || 'http://localhost:3000';
app.use(cors({origin:webOrigin,credentials:true}));
app.use(express.json({limit:'32kb'}));
app.use(cookieParser());
app.use((req,res,next)=>{
  if(['POST','PATCH','PUT','DELETE'].includes(req.method)) {
    if(req.get('origin') !== webOrigin) return res.status(403).json({error:'Request origin rejected.'});
  }
  next();
});
app.get('/health',(_req,res)=>res.json({ok:true, database: mongoose.connection.readyState===1 ? 'connected':'unavailable'}));
const authLimiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many attempts. Try again later.'}});
const loginBody=z.object({email:z.email(),password:z.string().min(1).max(256)}).strict();
app.post('/api/v1/auth/login',authLimiter,async(req,res)=>{
  const input=loginBody.parse(req.body);
  const user=await User.findOne({email:input.email.toLowerCase(),active:true}).select('+passwordHash');
  const matches=user && await bcrypt.compare(input.password,user.passwordHash);
  if(!matches) return res.status(401).json({error:'Invalid email or password.'});
  res.cookie(COOKIE_NAME,issueSession(user),cookieOptions());
  res.json({user:publicUser(user)});
});
app.post('/api/v1/auth/logout',(_req,res)=>{res.clearCookie(COOKIE_NAME,{...cookieOptions(),maxAge:undefined});res.json({ok:true});});
app.get('/api/v1/auth/me',requireAuth,(req,res)=>res.json({user:publicUser(req.user)}));

const route=express.Router();
route.use(requireAuth);
function scope(user) {
  if(user.role==='creditor') return {organizationId:user.organizationId};
  if(user.role==='operator') return {assignedTo:user._id};
  return {};
}
async function getCase(req,res,next) {
  if(!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({error:'Case not found.'});
  const item=await Case.findOne({_id:req.params.id,...scope(req.user)}).lean();
  if(!item || !assertAccess(req.user,item)) return res.status(404).json({error:'Case not found.'});
  req.caseItem=item;next();
}
async function logEvent(item,user,kind,text,visibility='creditor',metadata={}) {
  await Activity.create({caseId:item._id,organizationId:item.organizationId,actorId:user._id,kind,text,visibility,metadata});
}
// Short-lived per-case lease serializes demo ledger updates. Without this guard,
// two parallel verifications could each read the same unverified balance.
// It is NOT a substitute for an ACID transaction in a real financial platform.
async function withFinancialLock(req,res,operation) {
  const token=randomUUID();
  const acquired=await Case.updateOne({
    _id:req.caseItem._id,
    $or:[{financialLockToken:null},{financialLockExpiresAt:{$lt:new Date()}}]
  },{$set:{financialLockToken:token,financialLockExpiresAt:new Date(Date.now()+120_000)}});
  if(!acquired.modifiedCount) return res.status(409).json({error:'Another financial update is in progress. Refresh and retry.'});
  try {return await operation();}
  finally {
    try {await Case.updateOne({_id:req.caseItem._id,financialLockToken:token},{$set:{financialLockToken:null,financialLockExpiresAt:null}});}
    catch (error) {console.error('[API] Ledger lease cleanup failed; it will expire:',error?.message);}
  }
}
const moneySummary=(items)=>items.reduce((sum,i)=>sum+i,0);
route.get('/operators',requireRole('admin'),async(_req,res)=>{
  const operators=await User.find({role:'operator',active:true}).select('name email').lean();
  res.json({operators:operators.map(u=>({id:String(u._id),name:u.name,email:u.email}))});
});
route.get('/dashboard/summary',async(req,res)=>{
  const cases=await Case.find(scope(req.user)).sort({createdAt:-1}).lean();
  const ids=cases.map(c=>c._id);
  const receipts=ids.length?await Receipt.find({caseId:{$in:ids},status:'verified'}).lean():[];
  const byCase=new Map();for(const r of receipts){let a=byCase.get(String(r.caseId))||[];a.push(r);byCase.set(String(r.caseId),a);}
  const totals=cases.map(c=>({case:c,calc:calculateMoney(c.principalPaise,c.feeRateBps,byCase.get(String(c._id))||[])}));
  const live=totals.filter(t=>!['draft','rejected'].includes(t.case.status));
  res.json({
    summary:{totalCases:cases.length,activeCases:cases.filter(c=>['accepted','in_progress','on_hold'].includes(c.status)).length,
      awaitingReview:cases.filter(c=>c.status==='submitted').length,
      totalOutstandingPaise:moneySummary(live.map(t=>t.calc.outstandingPaise)),
      verifiedRecoveredPaise:moneySummary(totals.map(t=>t.calc.recoveredPaise)),
      estimatedFeesPaise:moneySummary(totals.map(t=>t.calc.feePaise))},
    recentCases:cases.slice(0,6).map(c=>({id:String(c._id),caseCode:c.caseCode,debtorName:c.debtorName,invoiceNo:c.invoiceNo,principalPaise:c.principalPaise,status:c.status,updatedAt:c.updatedAt})),
    statusBreakdown:['draft','submitted','needs_info','accepted','in_progress','on_hold','rejected','closed'].map(status=>({status,count:cases.filter(c=>c.status===status).length}))
  });
});
route.get('/cases',async(req,res)=>{
  const filter={...scope(req.user)};
  if(req.query.status && ['draft','submitted','needs_info','accepted','in_progress','on_hold','rejected','closed'].includes(req.query.status)) filter.status=req.query.status;
  const query=String(req.query.q||'').trim().slice(0,100);
  if(query)filter.$or=[{debtorName:{$regex:escapeRegex(query),$options:'i'}},{invoiceNo:{$regex:escapeRegex(query),$options:'i'}},{caseCode:{$regex:escapeRegex(query),$options:'i'}}];
  const items=await Case.find(filter).sort({updatedAt:-1}).limit(100).lean();
  res.json({cases:items.map(c=>({id:String(c._id),caseCode:c.caseCode,debtorName:c.debtorName,invoiceNo:c.invoiceNo,principalPaise:c.principalPaise,status:c.status,dueDate:c.dueDate,createdAt:c.createdAt,updatedAt:c.updatedAt,assignedTo:c.assignedTo?String(c.assignedTo):null}))});
});
function escapeRegex(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
const caseBody=z.object({debtorName:z.string().trim().min(2).max(160),invoiceNo:z.string().trim().min(2).max(70),
  issueDate:z.iso.date(),dueDate:z.iso.date(),principalPaise:z.number().int().min(100).max(1_000_000_000_00),
  description:z.string().trim().max(1200).default(''), disputed:z.boolean().default(false),evidenceLabel:z.string().trim().max(120).default('')}).strict().refine(x=>x.dueDate>=x.issueDate,{message:'Due date must be on or after issue date.',path:['dueDate']});
route.post('/cases',requireRole('creditor'),async(req,res)=>{
  const input=caseBody.parse(req.body);
  const item=await Case.create({...input,organizationId:req.user.organizationId,createdBy:req.user._id,caseCode:formatCaseCode(randomUUID().slice(0,8))});
  await logEvent(item,req.user,'created','Draft case created.');
  res.status(201).json({id:String(item._id),caseCode:item.caseCode});
});
route.get('/cases/:id',getCase,async(req,res)=>{
  const item=req.caseItem;
  const acts=await Activity.find({caseId:item._id,...(req.user.role==='creditor'?{visibility:'creditor'}:{})}).sort({createdAt:1}).populate('actorId','name role').lean();
  const recs=await Receipt.find({caseId:item._id}).sort({createdAt:-1}).lean();
  const calc=calculateMoney(item.principalPaise,item.feeRateBps,recs);
  // Unverified receipt references are internal reconciliation information.
  // Creditor dashboards receive verified ledger entries only.
  const visibleReceipts=req.user.role==='creditor'?recs.filter(r=>r.status==='verified'):recs;
  res.json({case:{...item,id:String(item._id),organizationId:String(item.organizationId),assignedTo:item.assignedTo?String(item.assignedTo):null},
    financials:calc,activities:acts.map(a=>({id:String(a._id),kind:a.kind,text:a.text,visibility:a.visibility,createdAt:a.createdAt,actor:a.actorId?.name||'Team member'})),
    receipts:visibleReceipts.map(r=>({id:String(r._id),amountPaise:r.amountPaise,kind:r.kind,status:r.status,reference:r.reference,createdAt:r.createdAt}))});
});
route.patch('/cases/:id',getCase,requireRole('creditor'),async(req,res)=>{
  if(!canEditDraft(req.user.role,req.caseItem.status))return res.status(409).json({error:'Only draft or information-requested cases can be edited.'});
  const input=caseBody.parse(req.body);
  await Case.updateOne({_id:req.caseItem._id,organizationId:req.user.organizationId},{$set:input});
  await logEvent(req.caseItem,req.user,'updated','Case details updated.');
  res.json({ok:true});
});
route.post('/cases/:id/submit',getCase,requireRole('creditor'),async(req,res)=>{
  if(!canSubmit(req.caseItem.status))return res.status(409).json({error:'Case has already been submitted.'});
  const updated=await Case.updateOne({_id:req.caseItem._id,status:{$in:['draft','needs_info']}},{$set:{status:'submitted',submittedAt:new Date()}});
  if(!updated.modifiedCount)return res.status(409).json({error:'Case has already been submitted.'});
  await logEvent(req.caseItem,req.user,'submitted','Invoice submitted for review.');res.json({ok:true});
});
const reviewBody=z.object({decision:z.enum(['accept','reject','request_info']),reason:z.string().trim().min(4).max(600),feeRateBps:z.number().int().min(1500).max(3000).optional()}).strict();
route.post('/cases/:id/review',getCase,requireRole('admin'),async(req,res)=>{
  if(!canReview(req.caseItem.status))return res.status(409).json({error:'Case is not awaiting review.'});
  const input=reviewBody.parse(req.body);
  const update={status:REVIEW_DECISIONS[input.decision],decisionReason:input.reason};
  if(input.decision==='accept'){update.feeRateBps=input.feeRateBps??2000;update.acceptedAt=new Date();}
  const result=await Case.updateOne({_id:req.caseItem._id,status:'submitted'},{$set:update});
  if(!result.modifiedCount)return res.status(409).json({error:'Case review changed. Refresh and retry.'});
  await logEvent(req.caseItem,req.user,'review',`Review: ${update.status.replace('_',' ')}. ${input.reason}`);
  res.json({ok:true});
});
const assignBody=z.object({operatorId:z.string().refine(mongoose.isValidObjectId,'Invalid operator ID')}).strict();
route.post('/cases/:id/assign',getCase,requireRole('admin'),async(req,res)=>{
  if(!canAssign(req.caseItem.status))return res.status(409).json({error:'Only accepted or in-progress cases can be assigned.'});
  const {operatorId}=assignBody.parse(req.body);
  const operator=await User.findOne({_id:operatorId,role:'operator',active:true}).lean();
  if(!operator)return res.status(422).json({error:'Operator does not exist.'});
  await Case.updateOne({_id:req.caseItem._id},{$set:{assignedTo:operator._id,status:'in_progress'}});
  await logEvent(req.caseItem,req.user,'assigned',`Case assigned to ${operator.name}.`);res.json({ok:true});
});
const activityBody=z.object({text:z.string().trim().min(3).max(1200),visibility:z.enum(['creditor','internal'])}).strict();
route.post('/cases/:id/activity',getCase,requireRole('admin','operator'),async(req,res)=>{
  if(!['accepted','in_progress','on_hold'].includes(req.caseItem.status))return res.status(409).json({error:'Case must be accepted before updates.'});
  const {text,visibility}=activityBody.parse(req.body);
  await logEvent(req.caseItem,req.user,'note',text,visibility);res.status(201).json({ok:true});
});
const receiptBody=z.object({amountPaise:z.number().int().positive().max(1_000_000_000_00),reference:z.string().trim().min(3).max(120)}).strict();
route.post('/cases/:id/receipts',getCase,requireRole('admin'),async(req,res)=>withFinancialLock(req,res,async()=>{
  if(!['accepted','in_progress','on_hold'].includes(req.caseItem.status))return res.status(409).json({error:'Case must be accepted first.'});
  const input=receiptBody.parse(req.body);
  const existing=await Receipt.find({caseId:req.caseItem._id}).lean();
  const totals=calculateMoney(req.caseItem.principalPaise,req.caseItem.feeRateBps,existing);
  const awaiting=existing.filter(r=>r.status==='recorded'&&r.kind==='receipt').reduce((a,r)=>a+r.amountPaise,0);
  if(input.amountPaise>totals.outstandingPaise-awaiting)return res.status(422).json({error:'Amount exceeds principal remaining after pending receipts.'});
  const r=await Receipt.create({...input,kind:'receipt',status:'recorded',caseId:req.caseItem._id,organizationId:req.caseItem.organizationId,recordedBy:req.user._id});
  await logEvent(req.caseItem,req.user,'receipt','Receipt recorded, awaiting verification.');
  res.status(201).json({id:String(r._id),status:'recorded'});
}));
route.post('/cases/:id/receipts/:receiptId/verify',getCase,requireRole('admin'),async(req,res)=>withFinancialLock(req,res,async()=>{
  if(!mongoose.isValidObjectId(req.params.receiptId))return res.status(404).json({error:'Receipt not found.'});
  const r=await Receipt.findOne({caseId:req.caseItem._id,_id:req.params.receiptId});
  if(!r)return res.status(404).json({error:'Receipt not found.'});
  if(r.status!=='recorded')return res.status(409).json({error:'Receipt has already been processed.'});
  const others=await Receipt.find({caseId:req.caseItem._id,status:'verified'}).lean();
  const totals=calculateMoney(req.caseItem.principalPaise,req.caseItem.feeRateBps,others);
  if(r.amountPaise>totals.outstandingPaise)return res.status(422).json({error:'Verified total would exceed invoice principal.'});
  const result=await Receipt.updateOne({_id:r._id,status:'recorded'},{$set:{status:'verified',verifiedBy:req.user._id,verifiedAt:new Date()}});
  if(!result.modifiedCount)return res.status(409).json({error:'Receipt already processed.'});
  await logEvent(req.caseItem,req.user,'verified','Receipt verified; financial totals updated.');
  res.json({ok:true});
}));
route.post('/cases/:id/receipts/:receiptId/reverse',getCase,requireRole('admin'),async(req,res)=>withFinancialLock(req,res,async()=>{
  const body=z.object({reason:z.string().trim().min(4).max(400)}).strict().parse(req.body);
  if(!mongoose.isValidObjectId(req.params.receiptId))return res.status(404).json({error:'Receipt not found.'});
  const r=await Receipt.findOne({_id:req.params.receiptId,caseId:req.caseItem._id,kind:'receipt',status:'verified'});
  if(!r)return res.status(404).json({error:'Verified receipt not found.'});
  const prior=await Receipt.findOne({reversedFrom:r._id,status:'verified'});
  if(prior)return res.status(409).json({error:'Receipt has already been reversed.'});
  await Receipt.create({caseId:req.caseItem._id,organizationId:req.caseItem.organizationId,amountPaise:r.amountPaise,kind:'reversal',status:'verified',reference:`REV-${r.reference}`,reversedFrom:r._id,recordedBy:req.user._id,verifiedBy:req.user._id,verifiedAt:new Date()});
  await logEvent(req.caseItem,req.user,'reversal',`Verified receipt correction: ${body.reason}`,'creditor');res.json({ok:true});
}));
app.use('/api/v1',route);
app.use((_req,res)=>res.status(404).json({error:'Not found.'}));
app.use((error,_req,res,_next)=>{
  if(error instanceof ZodError)return res.status(422).json({error:'Please correct the highlighted information.',issues:error.issues.map(i=>({field:i.path.join('.'),message:i.message}))});
  if(error?.code===11000)return res.status(409).json({error:'This invoice or reference already exists.'});
  if(error instanceof SyntaxError && 'body' in error) return res.status(400).json({error:'Invalid JSON request.'});
  if(error?.name==='CastError')return res.status(404).json({error:'Record not found.'});
  console.error('[API]',error?.message);
  res.status(500).json({error:'Something went wrong. Please retry.'});
});
export default app;
