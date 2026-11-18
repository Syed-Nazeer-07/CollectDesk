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
import {installRegistrationRoutes} from './registration.js';
import {installPasswordRecoveryRoutes} from './password-recovery.js';
import {installSupportRoutes} from './support.js';
import {installOrganizationRoutes} from './organizations.js';
import {installStaffRoutes} from './staff-invites.js';
import {installPrivateDocumentRoutes,privateDocumentService} from './private-documents.js';
import {installEvidenceRoutes} from './evidence.js';
import {caseSort,caseFilters,casesCsv,csvCell} from './case-register.js';
import {FinancialError,transactionalLedger,writeFinancial} from './financial-write.js';
import {installWorkQueueRoutes} from './work-queue.js';
import {installNotificationRoutes} from './notifications.js';
import {assertAccess,canAssign,canClose,canEditDraft,canHold,canResume,canReview,canSubmit,calculateMoney,financialTotals,CASE_STATUSES,REVIEW_DECISIONS,formatCaseCode,indiaDateKey,isOverdue,pageInfo,scopeForUser} from './rules.js';

const app=express();
// Requests reach Express through the internal Next.js reverse proxy.
// Trust only loopback and Docker-private proxy addresses, never arbitrary
// public X-Forwarded-For headers. This restores per-client rate-limit logic.
app.set('trust proxy','loopback, uniquelocal');
app.disable('x-powered-by');
app.use(helmet());
// Render exposes the public HTTPS URL; WEB_ORIGIN can override it for custom domains.
const webOrigin=process.env.WEB_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
app.use(cors({origin:webOrigin,credentials:true}));
app.use(express.json({limit:'32kb'}));
app.use(cookieParser());
// Authenticated and account APIs must never be cached by browsers or shared proxies.
app.use('/api/v1',(_req,res,next)=>{
  res.set('Cache-Control','private, no-store, max-age=0');
  next();
});
app.use((req,res,next)=>{
  if(['POST','PATCH','PUT','DELETE'].includes(req.method)) {
    if(req.get('origin') !== webOrigin) return res.status(403).json({error:'Request origin rejected.'});
  }
  next();
});
let inFlightPing;
function databasePing(){
  if(mongoose.connection.readyState!==1)return Promise.resolve(false);
  if(!inFlightPing){
    const controller=new AbortController();
    let timer;
    const deadline=new Promise(resolve=>{
      timer=setTimeout(()=>{
        resolve(false);
        controller.abort();
      },1500);
    });
    const ping=mongoose.connection.db.command({ping:1},{
      signal:controller.signal,timeoutMS:1200
    }).then(()=>true,()=>false);
    inFlightPing=Promise.race([ping,deadline]);
    // If the driver is still unwinding a timed-out ping, share its existing
    // result so repeated readiness probes cannot fill the connection pool.
    void ping.finally(()=>{
      clearTimeout(timer);
      inFlightPing=undefined;
    });
  }
  return inFlightPing;
}
app.get(['/health','/readiness'],async(req,res)=>{
  const connected=await databasePing();
  res.set('Cache-Control','no-store');
  const data=req.path==='/readiness'?{ok:connected}:{ok:connected,database:connected?'connected':'unavailable'};
  return res.status(connected?200:503).json(data);
});
/** Non-sensitive version metadata for external deployment verification. */
app.get('/api/v1/meta/release',(_req,res)=>{
  const sha=process.env.RENDER_GIT_COMMIT||process.env.GITHUB_SHA||'';
  res.set('Cache-Control','no-store');
  res.json({
    product:'CollectDesk',version:'0.3',
    commit:/^[a-f0-9]{40}$/i.test(sha)?sha.slice(0,12):null,
    environment:process.env.NODE_ENV==='production'?'production':'development',
    database:mongoose.connection.readyState===1?'connected':'unavailable'
  });
});
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
const profileBody = z.object({name:z.string().trim().min(2).max(90)}).strict();
app.patch('/api/v1/auth/me', requireAuth, async (req, res) => {
  const {name} = profileBody.parse(req.body);
  const user = await User.findOneAndUpdate(
    {_id:req.user._id, active:true}, {$set:{name}}, {returnDocument:'after', runValidators:true}
  );
  if (!user) return res.status(401).json({error:'Please sign in again.'});
  res.json({user:publicUser(user)});
});
installRegistrationRoutes(app,webOrigin);
installPasswordRecoveryRoutes(app,webOrigin);
installStaffRoutes(app,webOrigin);

const route=express.Router();
route.use(requireAuth);
// Help requests remain available while a new creditor completes company setup.
installSupportRoutes(route);
route.use((req,res,next)=>req.user.role==='creditor'&&!req.user.organizationId?res.status(403).json({error:'Complete your company setup before using the workspace.'}):next());
installOrganizationRoutes(app,route,webOrigin);
const scope=scopeForUser;
async function getCase(req,res,next) {
  if(!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({error:'Case not found.'});
  const item=await Case.findOne({_id:req.params.id,...scope(req.user)}).lean();
  if(!item || !assertAccess(req.user,item)) return res.status(404).json({error:'Case not found.'});
  req.caseItem=item;next();
}
async function logEvent(item,user,kind,text,visibility='creditor',metadata={},session=null) {
  await new Activity({caseId:item._id,organizationId:item.organizationId,actorId:user._id,kind,text,visibility,metadata}).save({session});
}
installEvidenceRoutes(route,{getCase,logEvent});
installPrivateDocumentRoutes(route,{
  getCase,
  getService:()=> app.locals.documentService?.() ?? privateDocumentService()
});
installNotificationRoutes(route);
installWorkQueueRoutes(route,{getCase,logEvent});
function financialAction(operation) {
  return async (req,res) => {
    const result = await writeFinancial(req, (item,session)=>operation(req,item,session));
    return res.status(result.status).json(result.body);
  };
}
route.get('/operators',requireRole('admin'),async(_req,res)=>{
  const operators=await User.find({role:'operator',active:true}).select('name email').lean();
  res.json({operators:operators.map(u=>({id:String(u._id),name:u.name,email:u.email}))});
});
route.get('/dashboard/summary',async(req,res)=>{
  const summary={totalCases:0,activeCases:0,awaitingReview:0,totalOutstandingPaise:0,verifiedRecoveredPaise:0,estimatedFeesPaise:0};
  const counts=new Map(CASE_STATUSES.map(status=>[status,0]));
  const recentCases=[];
  // Only one net ledger amount crosses the database boundary per accessible case.
  const cursor=Case.aggregate([
    {$match:scope(req.user)},
    {$sort:{updatedAt:-1,_id:-1}},
    {$project:{caseCode:1,debtorName:1,invoiceNo:1,principalPaise:1,feeRateBps:1,status:1,updatedAt:1}},
    {$lookup:{from:Receipt.collection.name,localField:'_id',foreignField:'caseId',as:'ledger',pipeline:[
      {$match:{status:'verified'}},
      {$group:{_id:null,net:{$sum:{$cond:[{$eq:['$kind','reversal']},{$multiply:[-1,'$amountPaise']},'$amountPaise']}}}}
    ]}}
  ]).allowDiskUse(true).cursor({batchSize:128});
  try {
    for await (const item of cursor) {
      const {_id,ledger,feeRateBps,...row}=item;
      const totals=financialTotals(row.principalPaise,feeRateBps,ledger[0]?.net ?? 0);
      counts.set(row.status,(counts.get(row.status)||0)+1);
      summary.totalCases++;
      if (['accepted','in_progress','on_hold'].includes(row.status)) summary.activeCases++;
      if (row.status==='submitted') summary.awaitingReview++;
      if (!['draft','rejected'].includes(row.status)) summary.totalOutstandingPaise+=totals.outstandingPaise;
      summary.verifiedRecoveredPaise+=totals.recoveredPaise;
      summary.estimatedFeesPaise+=totals.feePaise;
      if (recentCases.length<6) recentCases.push({...row,id:String(_id)});
    }
  } finally {
    await cursor.close();
  }
  if (!Object.values(summary).every(Number.isSafeInteger)) throw new Error('Unsafe portfolio total');
  res.json({summary,recentCases,statusBreakdown:Array.from(counts,([status,count])=>({status,count}))});
});
const caseListQuery=z.object({
  status:z.enum(['draft','submitted','needs_info','accepted','in_progress','on_hold','rejected','closed']).optional(),
  q:z.string().trim().max(100).optional(),
  sort:z.enum(['updated','due','amount']).default('updated'),
  page:z.coerce.number().int().min(1).max(10000).default(1),
  limit:z.coerce.number().int().min(1).max(100).default(25)
}).strict();
route.get('/cases',async(req,res)=>{
  const {status,q,page,limit,sort}=caseListQuery.parse(req.query);
  const filter=caseFilters({status,q},scope(req.user),escapeRegex);
  const [total,items]=await Promise.all([
    Case.countDocuments(filter),
    Case.find(filter).sort(caseSort(sort)).skip((page-1)*limit).limit(limit).lean()
  ]);
  res.json({cases:items.map(c=>({id:String(c._id),caseCode:c.caseCode,debtorName:c.debtorName,invoiceNo:c.invoiceNo,principalPaise:c.principalPaise,status:c.status,dueDate:c.dueDate,createdAt:c.createdAt,updatedAt:c.updatedAt,assignedTo:c.assignedTo?String(c.assignedTo):null})),pagination:pageInfo(page,limit,total)});
});
// Export every accessible matching case, not merely the currently visible page.
const exportQuery=caseListQuery.pick({status:true,q:true,sort:true});
route.get('/cases/export',async(req,res)=>{
  const {status,q,sort}=exportQuery.parse(req.query);
  const filter=caseFilters({status,q},scope(req.user),escapeRegex);
  const maxRows=5000;
  const items=await Case.find(filter)
    .sort(caseSort(sort))
    .select('caseCode debtorName invoiceNo principalPaise status dueDate createdAt updatedAt')
    .limit(maxRows+1).lean();
  if(items.length>maxRows)return res.status(413).json({
    error:'This export exceeds 5,000 cases. Narrow your search or status filter.'
  });
  res.set({
    'Content-Type':'text/csv; charset=utf-8',
    'Content-Disposition':'attachment; filename="collectdesk-cases.csv"',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'
  });
  return res.send(casesCsv(items));
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
  const [owner, acts, recs] = await Promise.all([
    item.assignedTo ? User.findById(item.assignedTo).select('name').lean() : null,
    Activity.find({caseId:item._id,...(req.user.role==='creditor'?{visibility:'creditor'}:{})}).sort({createdAt:1}).populate('actorId','name role').lean(),
    Receipt.find({caseId:item._id}).sort({createdAt:-1}).lean()
  ]);
  const calc=calculateMoney(item.principalPaise,item.feeRateBps,recs);
  // Unverified receipt references are internal reconciliation information.
  // Creditor dashboards receive verified ledger entries only.
  const visibleReceipts=req.user.role==='creditor'?recs.filter(r=>r.status==='verified'):recs;
  const {priority,followUpAt,followUpNote,...caseFields}=item;
  const workPlan=req.user.role==='creditor'?undefined:{priority:priority||'normal',followUpAt,followUpNote};
  res.json({workPlan,case:{...caseFields,operatorName:owner?.name || null,id:String(item._id),organizationId:String(item.organizationId),assignedTo:item.assignedTo?String(item.assignedTo):null},
    financials:calc,activities:acts.map(a=>({id:String(a._id),kind:a.kind,text:a.text,visibility:a.visibility,createdAt:a.createdAt,actor:a.actorId?.name||'Team member'})),
    approvalPolicy:{separateReceiptApproval:process.env.SEPARATE_RECEIPT_APPROVAL==='true',transactionalLedger:transactionalLedger()},
    receipts:visibleReceipts.map(r=>({id:String(r._id),amountPaise:r.amountPaise,kind:r.kind,status:r.status,reference:r.reference,reversedFrom:r.reversedFrom?String(r.reversedFrom):null,
      recordedBy:req.user.role==='admin'?String(r.recordedBy):null,createdAt:r.createdAt}))});
});
route.get('/cases/:id/reconciliation.csv',getCase,requireRole('admin'),async(req,res)=>{
  const item=req.caseItem;
  const receipts=await Receipt.find({caseId:item._id,organizationId:item.organizationId})
    .sort({createdAt:1,_id:1}).limit(5001).lean();
  if(receipts.length>5000) return res.status(413).json({error:'This ledger exceeds the 5,000-row export limit.'});
  const totals=calculateMoney(item.principalPaise,item.feeRateBps,receipts);
  const rows=[
    ['Case','Principal (paise)','Verified recovery (paise)','Outstanding (paise)','Estimated fee (paise)'],
    [item.caseCode,item.principalPaise,totals.recoveredPaise,totals.outstandingPaise,totals.feePaise],
    [],
    ['Receipt ID','Reference','Kind','Status','Amount (paise)','Verified effect (paise)','Reversed entry','Recorded at','Verified at'],
    ...receipts.map(receipt=>[
      receipt._id,receipt.reference,receipt.kind,receipt.status,receipt.amountPaise,
      receipt.status==='verified' ? (receipt.kind==='reversal' ? -receipt.amountPaise : receipt.amountPaise) : 0,
      receipt.reversedFrom,receipt.createdAt?.toISOString(),receipt.verifiedAt?.toISOString()
    ])
  ];
  res.set({'Content-Type':'text/csv; charset=utf-8',
    'Content-Disposition':'attachment; filename="collectdesk-reconciliation.csv"'});
  res.send('\uFEFF'+rows.map(row=>row.map(value=>typeof value==='number'?String(value):csvCell(value)).join(',')).join('\r\n')+'\r\n');
});
route.patch('/cases/:id',getCase,requireRole('creditor'),async(req,res)=>{
  if(!canEditDraft(req.user.role,req.caseItem.status))return res.status(409).json({error:'Only draft or information-requested cases can be edited.'});
  const {expectedUpdatedAt,...fields}=z.object({
    expectedUpdatedAt:z.iso.datetime().optional()
  }).passthrough().parse(req.body);
  const input=caseBody.parse(fields);
  // Match the editable state on the write itself. An administrator or another
  // request could have submitted the case after getCase loaded its old status.
  const result=await Case.updateOne({
    _id:req.caseItem._id,
    organizationId:req.user.organizationId,
    status:{$in:['draft','needs_info']},
    ...(expectedUpdatedAt ? {updatedAt:new Date(expectedUpdatedAt)} : {}),
    financialLockToken:null
  },{$set:input});
  if(!result.matchedCount)return res.status(409).json({error:'This case changed or is no longer editable. Refresh before continuing.'});
  await logEvent(req.caseItem,req.user,'updated','Draft case details updated.');
  res.json({ok:true});
});
route.post('/cases/:id/submit',getCase,requireRole('creditor'),async(req,res)=>{
  if(!canSubmit(req.caseItem.status))return res.status(409).json({error:'Case has already been submitted.'});
  if(!isOverdue(req.caseItem.dueDate))return res.status(422).json({error:'Only overdue invoices can be submitted. Check the due date.'});
  const updated=await Case.updateOne({
    _id:req.caseItem._id,
    status:{$in:['draft','needs_info']},
    financialLockToken:null,
    // Date-only invoices are stored at UTC midnight. Match the current Indian
    // business day at the actual write, not just the earlier getCase snapshot.
    dueDate:{$lt:new Date(indiaDateKey()+'T00:00:00.000Z')}
  },{$set:{status:'submitted',submittedAt:new Date()}});
  if(!updated.modifiedCount)return res.status(409).json({error:'This case changed or is processing an attachment. Refresh and retry.'});
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
  // The case may have been closed/held or entered a ledger update while the
  // operator lookup was running. Check state and lease atomically on the write.
  const updated=await Case.updateOne({
    _id:req.caseItem._id,status:{$in:['accepted','in_progress']},financialLockToken:null
  },{$set:{assignedTo:operator._id,status:'in_progress'}});
  if(!updated.matchedCount)return res.status(409).json({error:'Case changed while assigning. Refresh and retry.'});
  await logEvent(req.caseItem,req.user,'assigned',`Case assigned to ${operator.name}.`);res.json({ok:true});
});
const transitionBody=z.object({
  action:z.enum(['hold','resume','close']),
  reason:z.string().trim().min(4).max(400)
}).strict();
route.post('/cases/:id/status',getCase,requireRole('admin'),financialAction(async(req,item,session)=>{
  const {action,reason}=transitionBody.parse(req.body);
  const previous=item.status;
  const permitted=action==='hold'?canHold(previous):action==='resume'?canResume(previous):canClose(previous);
  if(!permitted) throw new FinancialError(409,'This case cannot be moved to the requested status. Refresh first.');
  // Prevent closing an open reconciliation item. Receipts remain demonstrative,
  // but pending review must not silently disappear behind a terminal status.
  if(action==='close'&&await Receipt.exists({caseId:item._id,status:'recorded'}).session(session)){
    throw new FinancialError(409,'Verify or reject all pending receipts before closing this case.');
  }
  const nextStatus=action==='hold'?'on_hold':action==='close'?'closed':item.assignedTo?'in_progress':'accepted';
  const updated=await Case.updateOne(
    {_id:item._id,status:previous},
    {$set:{status:nextStatus}}, {session}
  );
  if(!updated.matchedCount)throw new FinancialError(409,'Case status changed. Refresh and retry.');
  await logEvent(item,req.user,'status',`Case ${action==='hold'?'placed on hold':action==='resume'?'resumed':'closed'}: ${reason}`,'creditor',{},session);
  return {status:200,body:{ok:true,status:nextStatus}};
}));
const activityBody=z.object({text:z.string().trim().min(3).max(1200),visibility:z.enum(['creditor','internal'])}).strict();
route.post('/cases/:id/activity',getCase,requireRole('admin','operator'),async(req,res)=>{
  if(!['accepted','in_progress','on_hold'].includes(req.caseItem.status))return res.status(409).json({error:'Case must be accepted before updates.'});
  const {text,visibility}=activityBody.parse(req.body);
  const current=await Case.findOne({_id:req.caseItem._id,...scope(req.user),status:{$in:['accepted','in_progress','on_hold']}}).lean();
  if(!current||!assertAccess(req.user,current))return res.status(409).json({error:'Case status or assignment changed. Refresh before posting.'});
  await logEvent(current,req.user,'note',text,visibility);res.status(201).json({ok:true});
});
const receiptBody=z.object({amountPaise:z.number().int().positive().max(1_000_000_000_00),reference:z.string().trim().min(3).max(120)}).strict();
route.post('/cases/:id/receipts',getCase,requireRole('admin'),financialAction(async(req,item,session)=>{
  if(!['accepted','in_progress','on_hold'].includes(item.status))throw new FinancialError(409,'Case must be accepted first.');
  const input=receiptBody.parse(req.body);
  const existing=await Receipt.find({caseId:item._id}).session(session).lean();
  if (existing.some(row=>row.reference===input.reference))
    throw new FinancialError(409,'This receipt reference already exists for the case.');
  const totals=calculateMoney(item.principalPaise,item.feeRateBps,existing);
  const awaiting=existing.filter(r=>r.status==='recorded'&&r.kind==='receipt').reduce((a,r)=>a+r.amountPaise,0);
  if(input.amountPaise>totals.outstandingPaise-awaiting)throw new FinancialError(422,'Amount exceeds principal remaining after pending receipts.');
  const r=await new Receipt({...input,kind:'receipt',status:'recorded',caseId:item._id,organizationId:item.organizationId,recordedBy:req.user._id}).save({session});
  await logEvent(item,req.user,'receipt','Receipt recorded, awaiting verification.','creditor',{receiptId:r._id},session);
  return {status:201,body:{id:String(r._id),status:'recorded'}};
}));
// Reject an erroneous pending fictional receipt so it no longer blocks case
// reconciliation or closure. A verified receipt requires a reversal instead.
route.post('/cases/:id/receipts/:receiptId/reject',getCase,requireRole('admin'),financialAction(async(req,item,session)=>{
  const {reason}=z.object({reason:z.string().trim().min(4).max(400)}).strict().parse(req.body);
  if(!mongoose.isValidObjectId(req.params.receiptId))throw new FinancialError(404,'Receipt not found.');
  const result=await Receipt.updateOne({
    _id:req.params.receiptId,
    caseId:item._id,
    kind:'receipt',
    status:'recorded'
  },{$set:{status:'rejected'}}, {session});
  if(!result.matchedCount)throw new FinancialError(409,'Only pending receipts may be rejected.');
  await logEvent(item,req.user,'receipt_rejected',`Pending receipt rejected: ${reason}`,'internal',{receiptId:req.params.receiptId},session);
  return {status:200,body:{ok:true}};
}));
route.post('/cases/:id/receipts/:receiptId/verify',getCase,requireRole('admin'),financialAction(async(req,item,session)=>{
  if(!mongoose.isValidObjectId(req.params.receiptId))throw new FinancialError(404,'Receipt not found.');
  const r=await Receipt.findOne({caseId:item._id,_id:req.params.receiptId}).session(session);
  if(!r)throw new FinancialError(404,'Receipt not found.');
  if(r.status!=='recorded')throw new FinancialError(409,'Receipt has already been processed.');
  // Optional strict maker/checker mode for teams with at least two admins.
  // Disabled by default so existing single-admin demo workspaces keep working.
  if(process.env.SEPARATE_RECEIPT_APPROVAL==='true' && String(r.recordedBy)===String(req.user._id))
    throw new FinancialError(403,'A different administrator must verify this receipt.');
  const others=await Receipt.find({caseId:item._id,status:'verified'}).session(session).lean();
  const totals=calculateMoney(item.principalPaise,item.feeRateBps,others);
  if(r.amountPaise>totals.outstandingPaise)throw new FinancialError(422,'Verified total would exceed invoice principal.');
  const result=await Receipt.updateOne({_id:r._id,status:'recorded'},{$set:{status:'verified',verifiedBy:req.user._id,verifiedAt:new Date()}}, {session});
  if(!result.modifiedCount)throw new FinancialError(409,'Receipt already processed.');
  await logEvent(item,req.user,'verified','Receipt verified; financial totals updated.','creditor',{receiptId:r._id},session);
  return {status:200,body:{ok:true}};
}));
route.post('/cases/:id/receipts/:receiptId/reverse',getCase,requireRole('admin'),financialAction(async(req,item,session)=>{
  const body=z.object({reason:z.string().trim().min(4).max(400)}).strict().parse(req.body);
  if(!mongoose.isValidObjectId(req.params.receiptId))throw new FinancialError(404,'Receipt not found.');
  const r=await Receipt.findOne({_id:req.params.receiptId,caseId:item._id,kind:'receipt',status:'verified'}).session(session);
  if(!r)throw new FinancialError(404,'Verified receipt not found.');
  const prior=await Receipt.findOne({reversedFrom:r._id,status:'verified'}).session(session);
  if(prior)throw new FinancialError(409,'Receipt has already been reversed.');
  const reversal = await new Receipt({caseId:item._id,organizationId:item.organizationId,amountPaise:r.amountPaise,kind:'reversal',status:'verified',reference:`CD-REV-${randomUUID()}`,reversedFrom:r._id,recordedBy:req.user._id,verifiedBy:req.user._id,verifiedAt:new Date()}).save({session});
  await logEvent(item,req.user,'reversal',`Verified receipt correction: ${body.reason}`,'creditor',{receiptId:reversal._id,reversedFrom:r._id},session);
  return {status:200,body:{ok:true}};
}));
app.use('/api/v1',route);
app.use((_req,res)=>res.status(404).json({error:'Not found.'}));
app.use((error,_req,res,_next)=>{
  if(error instanceof FinancialError)return res.status(error.status).json({error:error.message});
  if(error instanceof ZodError)return res.status(422).json({error:'Please correct the highlighted information.',issues:error.issues.map(i=>({field:i.path.join('.'),message:i.message}))});
  if(error?.code===11000)return res.status(409).json({error:'This invoice or reference already exists.'});
  if(error instanceof SyntaxError && 'body' in error) return res.status(400).json({error:'Invalid JSON request.'});
  if(error?.name==='CastError')return res.status(404).json({error:'Record not found.'});
  if(error?.type==='entity.too.large')return res.status(413).json({error:'Uploaded document is too large.'});
  if (['MongoServerSelectionError','MongooseServerSelectionError','MongoNetworkError'].includes(error?.name))
    return res.status(503).json({error:'Database temporarily unavailable. Please retry.'});
  console.error('[API] Request failed', {name:error?.name});
  res.status(500).json({error:'Something went wrong. Please retry.'});
});
export default app;
