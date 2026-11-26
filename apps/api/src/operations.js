import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Case,Receipt,User} from './models.js';
import {requireRole} from './auth.js';
import {scopeForUser,indiaDateKey} from './rules.js';
import {withCaseTransaction,transactionResponse} from './ledger.js';

const ACTIVE=['accepted','in_progress','on_hold'];
const schedule=z.object({dueDate:z.iso.date(),note:z.string().trim().min(3).max(400),revision:z.string().uuid().nullable()}).strict();
const finish=z.object({revision:z.string().uuid(),outcome:z.string().trim().min(3).max(400)}).strict();
const reportQuery=z.object({from:z.iso.date(),to:z.iso.date()}).strict();
const queueQuery=z.object({page:z.coerce.number().int().min(1).max(1000).default(1)}).strict();
function dateStart(key){return new Date(key+'T00:00:00.000+05:30');}
export function reportRange(from,to){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from<'1900-01-01'||to>'2199-12-31')return null;
  const start=dateStart(from),last=dateStart(to);
  const days=(last-start)/86400000+1;
  if(!Number.isInteger(days)||days<1||days>366)return null;
  return {start,end:new Date(last.getTime()+86400000)};
}
function publicFollowUp(item){
  const f=item?.followUp;
  return f?{dueDate:f.dueDate.toISOString().slice(0,10),note:f.note,revision:f.revision}:null;
}
function safeDecimal(value){
  const n=Number(value.toString());
  if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid report total');
  return n;
}
function sumSafe(a,b){const n=a+b;if(!Number.isSafeInteger(n))throw new Error('Unsafe report total');return n;}
export function summarizeMovements(rows,from,to){
  if(!reportRange(from,to))throw new Error('Invalid report interval');
  const months=[];
  let month=from.slice(0,7);
  while(month<=to.slice(0,7)){
    const [year,m]=month.split('-').map(Number);
    const row=rows.find(r=>r._id===month);
    const grossPaise=row?safeDecimal(row.gross):0,reversedPaise=row?safeDecimal(row.reversed):0;
    months.push({month,grossPaise,reversedPaise,netPaise:grossPaise-reversedPaise,count:row?.count??0});
    month=new Date(Date.UTC(year,m,1)).toISOString().slice(0,7);
  }
  const totals=months.reduce((a,r)=>({grossPaise:sumSafe(a.grossPaise,r.grossPaise),reversedPaise:sumSafe(a.reversedPaise,r.reversedPaise),netPaise:sumSafe(a.netPaise,r.netPaise),count:sumSafe(a.count,r.count)}),{grossPaise:0,reversedPaise:0,netPaise:0,count:0});
  return {from,to,months,totals};
}
export function installOperationsRoutes(route,{getCase,logEvent}){
  // Admin-only, explicitly current workload rather than individual productivity.
  route.get('/operations/control',requireRole('admin'),async(_req,res)=>{
    const asOf=indiaDateKey(),cutoff=new Date(asOf+'T00:00:00.000Z');
    const [groups,staff,pending]=await Promise.all([
      Case.aggregate([{$match:{status:{$in:ACTIVE}}},{$group:{_id:{$ifNull:['$assignedTo',null]},active:{$sum:1},
        onHold:{$sum:{$cond:[{$eq:['$status','on_hold']},1,0]}},
        due:{$sum:{$cond:[{$and:[{$eq:[{$type:'$followUp.dueDate'},'date']},{$lte:['$followUp.dueDate',cutoff]}]},1,0]}},
        scheduled:{$sum:{$cond:[{$eq:[{$type:'$followUp.dueDate'},'date']},1,0]}}}}]).option({maxTimeMS:15000}),
      User.find({role:'operator',active:true}).select('name').sort({name:1,_id:1}).limit(501).lean(),
      Receipt.aggregate([{$match:{kind:'receipt',status:'recorded'}},
        {$lookup:{from:Case.collection.name,localField:'caseId',foreignField:'_id',as:'linked'}},
        {$unwind:'$linked'},{$match:{$expr:{$eq:['$organizationId','$linked.organizationId']}}},
        {$facet:{summary:[{$group:{_id:null,count:{$sum:1},total:{$sum:{$toDecimal:'$amountPaise'}}}}],
          items:[{$sort:{createdAt:1,_id:1}},{$limit:25},{$project:{_id:0,caseId:1,caseCode:'$linked.caseCode',debtorName:'$linked.debtorName',amountPaise:1,createdAt:1}}]}}]).option({maxTimeMS:15000})
    ]);
    if(staff.length>500)return res.status(413).json({error:'Staff roster exceeds the demo reporting limit.'});
    const activeIds=new Set(staff.map(x=>String(x._id)));
    const workload=staff.map(x=>{const g=groups.find(y=>String(y._id)===String(x._id));return {id:String(x._id),name:x.name,active:g?.active??0,onHold:g?.onHold??0,due:g?.due??0,scheduled:g?.scheduled??0};});
    workload.sort((a,b)=>b.due-a.due||b.active-a.active||a.name.localeCompare(b.name));
    const unassigned=groups.filter(g=>!g._id).reduce((n,g)=>n+g.active,0);
    const inactiveAssignments=groups.filter(g=>g._id&&!activeIds.has(String(g._id))).reduce((n,g)=>n+g.active,0);
    const p=pending[0],summary=p?.summary?.[0];
    res.json({asOf,workload,unassigned,inactiveAssignments,pending:{count:summary?.count??0,amountPaise:summary?safeDecimal(summary.total):0,items:p?.items??[]}});
  });
  route.get('/reports/recoveries',async(req,res)=>{
    const {from,to}=reportQuery.parse(req.query);
    const range=reportRange(from,to);
    if(!range)return res.status(422).json({error:'Choose a date range of 1–366 days.'});
    // Verified movement date, not invoice date or recording date. Current case
    // permissions are evaluated at query time, including current assignment.
    const rows=await Receipt.aggregate([
      {$match:{status:'verified',verifiedAt:{$gte:range.start,$lt:range.end},kind:{$in:['receipt','reversal']}}},
      {$lookup:{from:Case.collection.name,localField:'caseId',foreignField:'_id',as:'linked'}},
      {$unwind:'$linked'},
      {$match:{$expr:{$eq:['$organizationId','$linked.organizationId']},...Object.fromEntries(Object.entries(scopeForUser(req.user)).map(([k,v])=>['linked.'+k,v]))}},
      {$group:{_id:{$dateToString:{date:'$verifiedAt',format:'%Y-%m',timezone:'Asia/Kolkata'}},
        gross:{$sum:{$cond:[{$eq:['$kind','receipt']},{$toDecimal:'$amountPaise'},0]}},
        reversed:{$sum:{$cond:[{$eq:['$kind','reversal']},{$toDecimal:'$amountPaise'},0]}},count:{$sum:1}}}
    ]).option({maxTimeMS:15000});
    res.json(summarizeMovements(rows,from,to));
  });
  route.get('/follow-ups',requireRole('admin','operator'),async(req,res)=>{
    const {page}=queueQuery.parse(req.query),asOf=indiaDateKey(),cutoff=new Date(asOf+'T00:00:00.000Z');
    const match={...scopeForUser(req.user),status:{$in:ACTIVE},'followUp.dueDate':{$exists:true,$ne:null}};
    const [total,due,items]=await Promise.all([
      Case.countDocuments(match),Case.countDocuments({...match,'followUp.dueDate':{$lte:cutoff}}),
      Case.find(match).select('caseCode debtorName status +followUp').sort({'followUp.dueDate':1,_id:1}).skip((page-1)*25).limit(25).lean()
    ]);
    res.json({asOf,total,due,page,items:items.map(x=>({id:String(x._id),caseCode:x.caseCode,debtorName:x.debtorName,status:x.status,...publicFollowUp(x)}))});
  });
  route.get('/cases/:id/follow-up',getCase,requireRole('admin','operator'),async(req,res)=>{
    const item=await Case.findOne({_id:req.caseItem._id,...scopeForUser(req.user)}).select('+followUp').lean();
    if(!item)return res.status(404).json({error:'Case not found.'});
    res.json({followUp:publicFollowUp(item)});
  });
  route.post('/cases/:id/follow-up',getCase,requireRole('admin','operator'),async(req,res)=>withCaseTransaction(req,res,async session=>{
    const input=schedule.parse(req.body),item=req.caseItem;
    if(!ACTIVE.includes(item.status))return transactionResponse(409,{error:'Only active cases can have follow-ups.'});
    if(input.dueDate<indiaDateKey()||input.dueDate>'2199-12-31')return transactionResponse(422,{error:'Choose today or a future date.'});
    const old=await Case.findById(item._id).select('+followUp').session(session).lean();
    if((old.followUp?.revision??null)!==input.revision)return transactionResponse(409,{error:'Follow-up changed. Refresh before updating.'});
    const followUp={dueDate:new Date(input.dueDate+'T00:00:00.000Z'),note:input.note,revision:randomUUID(),scheduledBy:req.user._id};
    await Case.updateOne({_id:item._id},{$set:{followUp}},{session,runValidators:true});
    await logEvent(item,req.user,'follow_up_scheduled','Internal follow-up: '+input.note,'internal',{dueDate:input.dueDate,revision:followUp.revision,previousRevision:input.revision},session);
    return transactionResponse(200,{followUp:publicFollowUp({followUp})});
  }));
  route.post('/cases/:id/follow-up/complete',getCase,requireRole('admin','operator'),async(req,res)=>withCaseTransaction(req,res,async session=>{
    const input=finish.parse(req.body),item=req.caseItem;
    if(!ACTIVE.includes(item.status))return transactionResponse(409,{error:'Case is not active.'});
    const old=await Case.findById(item._id).select('+followUp').session(session).lean();
    if(!old.followUp||old.followUp.revision!==input.revision)return transactionResponse(409,{error:'Follow-up changed. Refresh before completing.'});
    await Case.updateOne({_id:item._id},{$set:{followUp:null}},{session});
    await logEvent(item,req.user,'follow_up_completed','Internal follow-up outcome: '+input.outcome,'internal',{revision:input.revision,dueDate:old.followUp.dueDate},session);
    return transactionResponse(200,{followUp:null});
  }));
}
