import {z} from 'zod';
import {Case,User} from './models.js';
import {requireRole} from './auth.js';
import {scopeForUser} from './rules.js';
import {FinancialError,writeFinancial} from './financial-write.js';

const activeStatuses=['accepted','in_progress','on_hold'];
const priorities=['urgent','high','normal'];
const queueQuery=z.object({
  view:z.enum(['followups','unassigned']).default('followups'),
  page:z.coerce.number().int().min(1).max(200).default(1)
}).strict();
const update=z.object({
  priority:z.enum(priorities).optional(),
  followUpAt:z.iso.datetime().nullable(),
  followUpNote:z.string().trim().max(400)
}).strict();

export function installWorkQueueRoutes(route,{getCase,logEvent}){
  route.get('/work-queue',requireRole('admin','operator'),async(req,res)=>{
    const {view,page}=queueQuery.parse(req.query);
    if(view==='unassigned'&&req.user.role!=='admin')return res.status(403).json({error:'This queue requires administrator access.'});
    const filter={...scopeForUser(req.user),status:{$in:activeStatuses}};
    if(view==='unassigned')filter.assignedTo=null;
    else filter.followUpAt={$type:'date'};
    const sort=view==='unassigned'?{dueDate:1,_id:1}:{followUpAt:1,_id:1};
    const rows=await Case.find(filter).sort(sort).skip((page-1)*25).limit(26)
      .select('caseCode debtorName priority followUpAt followUpNote status').lean();
    const now=new Date();
    res.json({items:rows.slice(0,25).map(row=>({id:String(row._id),caseCode:row.caseCode,
      debtorName:row.debtorName,status:row.status,priority:row.priority||'normal',
      followUpAt:row.followUpAt,followUpNote:row.followUpNote,overdue:row.followUpAt<now && Boolean(row.followUpAt)})),
      hasMore:rows.length>25});
  });

  route.post('/cases/:id/work-plan',getCase,requireRole('admin','operator'),async(req,res)=>{
    const plan=update.parse(req.body);
    if(plan.priority && req.user.role!=='admin')return res.status(403).json({error:'Only administrators can change priority.'});
    if(plan.followUpAt && Date.parse(plan.followUpAt)<=Date.now())
      return res.status(422).json({error:'Choose a future follow-up time.'});
    const result=await writeFinancial(req,async(item,session)=>{
      const fields={followUpAt:plan.followUpAt,followUpNote:plan.followUpAt ? plan.followUpNote : ''};
      if(plan.priority) fields.priority=plan.priority;
      const current=await Case.updateOne(
        {_id:item._id,...scopeForUser(req.user),status:{$in:activeStatuses}},
        {$set:fields},{session}
      );
      if(!current.matchedCount)throw new FinancialError(409,'Assignment or case status changed.');
      await logEvent(item,req.user,'work_plan','Updated the internal work plan.','internal',fields,session);
      return {status:200,body:{ok:true}};
    });
    res.status(result.status).json(result.body);
  });

  route.get('/staff/operators',requireRole('admin'),async(req,res)=>{
    const {page}=z.object({page:z.coerce.number().int().min(1).max(200).default(1)}).strict().parse(req.query);
    const rows=await User.find({role:'operator'}).sort({name:1,_id:1}).skip((page-1)*25).limit(26).select('name email active').lean();
    const counts=await Case.aggregate([
      {$match:{assignedTo:{$in:rows.map(row=>row._id)},status:{$in:activeStatuses}}},
      {$group:{_id:'$assignedTo',count:{$sum:1}}}
    ]);
    const workload=new Map(counts.map(row=>[String(row._id),row.count]));
    res.json({operators:rows.slice(0,25).map(row=>({id:String(row._id),name:row.name,email:row.email,
      active:row.active,assigned:workload.get(String(row._id))||0})),hasMore:rows.length>25});
  });

  route.post('/staff/operators/:id/access',requireRole('admin'),async(req,res)=>{
    const {id}=z.object({id:z.string().regex(/^[a-f0-9]{24}$/i)}).parse(req.params);
    const {active}=z.object({active:z.boolean()}).strict().parse(req.body);
    const result=await User.updateOne({_id:id,role:'operator',active:!active},{
      $set:{active,accessChangedBy:req.user._id,accessChangedAt:new Date()},$inc:{sessionVersion:1}
    });
    if(!result.matchedCount)return res.status(409).json({error:'Operator access has already changed.'});
    res.json({ok:true});
  });
}
