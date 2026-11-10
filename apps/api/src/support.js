import mongoose from 'mongoose';
import {z} from 'zod';
import {rateLimit} from 'express-rate-limit';
import {SupportRequest} from './models.js';
import {requireRole} from './auth.js';

// Support remains a human-reviewed workflow; no automatic email or case actions.
const category=z.enum(['onboarding','case','account','technical','other']);
const createBody=z.object({
  category,
  subject:z.string().trim().min(5).max(120),
  message:z.string().trim().min(15).max(2000)
}).strict();
const changeBody=z.object({
  status:z.enum(['open','in_progress','resolved']),
  resolutionNote:z.string().trim().max(2000).optional()
}).strict().superRefine((v,ctx)=>{
  if(v.status==='resolved' && (!v.resolutionNote || v.resolutionNote.length<10))
    ctx.addIssue({code:'custom',path:['resolutionNote'],message:'Provide a resolution note of at least 10 characters.'});
});
const listQuery=z.object({
  status:z.enum(['open','in_progress','resolved']).optional(),
  page:z.coerce.number().int().min(1).max(10000).default(1)
}).strict();
const createLimiter=rateLimit({
  windowMs:60*60*1000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many support requests. Please try again later.'}
});
function serialize(item){
  const reporter=item.createdBy;
  return {
    id:String(item._id),category:item.category,subject:item.subject,message:item.message,
    status:item.status,resolutionNote:item.resolutionNote||'',
    createdAt:item.createdAt,updatedAt:item.updatedAt,resolvedAt:item.resolvedAt,
    reporter:reporter && typeof reporter==='object' && reporter.name
      ? {name:reporter.name,email:reporter.email}
      : null
  };
}
export function installSupportRoutes(route){
  // Auth is applied by the parent router. Never allow a client to select the
  // ticket's creator, owning company or priority.
  route.post('/support/requests',createLimiter,async(req,res)=>{
    const input=createBody.parse(req.body);
    const item=await SupportRequest.create({
      ...input,createdBy:req.user._id,organizationId:req.user.organizationId||null
    });
    res.status(201).json({id:String(item._id),status:item.status});
  });
  route.get('/support/requests',async(req,res)=>{
    const {status,page}=listQuery.parse(req.query);
    const filter=req.user.role==='admin'?{}:{createdBy:req.user._id};
    if(status)filter.status=status;
    const limit=20;
    const [total,rows]=await Promise.all([
      SupportRequest.countDocuments(filter),
      SupportRequest.find(filter).sort({updatedAt:-1,_id:-1})
        .skip((page-1)*limit).limit(limit)
        .populate('createdBy','name email').lean()
    ]);
    res.set('Cache-Control','no-store');
    res.json({
      requests:rows.map(serialize),
      pagination:{page,pageSize:limit,total,hasMore:page*limit<total}
    });
  });
  route.patch('/support/requests/:id',requireRole('admin'),async(req,res)=>{
    if(!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({error:'Support request not found.'});
    const input=changeBody.parse(req.body);
    const changes={
      status:input.status,
      resolutionNote:input.status==='resolved'?input.resolutionNote:'',
      resolvedAt:input.status==='resolved'?new Date():null,
      handledBy:req.user._id
    };
    const updated=await SupportRequest.findOneAndUpdate(
      {_id:req.params.id},{$set:changes},{new:true}
    );
    if(!updated)return res.status(404).json({error:'Support request not found.'});
    res.set('Cache-Control','no-store');
    res.json({ok:true,status:updated.status});
  });
}
