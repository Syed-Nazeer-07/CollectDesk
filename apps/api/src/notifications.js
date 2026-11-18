import {z} from 'zod';
import {Activity,Case,SupportRequest,User} from './models.js';
import {scopeForUser} from './rules.js';

const KINDS = ['submitted','review','assigned','status','note','verified','reversal','receipt','receipt_rejected','updated','work_plan'];
const querySchema = z.object({
  page:z.coerce.number().int().min(1).max(100).default(1),
  unread:z.enum(['0','1']).default('0')
}).strict();
const PAGE_SIZE = 20;

/**
 * Query the existing append-only case activity trail; do not create a second
 * notification store that could disagree with the case timeline.
 * Access is checked against the CURRENT case assignment/company on every read.
 */
function activityScope(user,unreadOnly=false) {
  const match={kind:{$in:KINDS},actorId:{$ne:user._id}};
  if(user.role==='creditor') {
    match.visibility='creditor';
    if(user.organizationId) match.organizationId=user.organizationId;
  }
  const access=user.role==='admin'?{}:
    user.role==='creditor' && user.organizationId?{'case.organizationId':user.organizationId}:
    user.role==='operator' && user._id?{'case.assignedTo':user._id}:
    {_id:{$exists:false}};
  if (unreadOnly) match.createdAt={$gt:user.notificationsSeenAt || new Date(0)};
  return [
    {$match:match},
    {$lookup:{from:Case.collection.name,localField:'caseId',foreignField:'_id',as:'case'}},
    {$unwind:'$case'},
    {$match:access}
  ];
}

export function notificationPipeline(user,page=1,unreadOnly=false) {
  const seenAt=user.notificationsSeenAt || new Date(0);
  return [
    ...activityScope(user),
    {$facet:{
      items:[
        ...(unreadOnly?[{$match:{createdAt:{$gt:seenAt}}}]:[]),
        {$sort:{createdAt:-1,_id:-1}},
        {$skip:(page-1)*PAGE_SIZE},
        {$limit:PAGE_SIZE+1},
        {$project:{_id:1,caseId:1,kind:1,text:1,createdAt:1,caseCode:'$case.caseCode',
          debtorName:'$case.debtorName',unread:{$gt:['$createdAt',seenAt]}}}
      ],
      unread:[
        {$match:{createdAt:{$gt:seenAt}}},
        {$limit:100},
        {$count:'value'}
      ]
    }}
  ];
}

function operationsQueries(user, unreadOnly){
  const seen=user.notificationsSeenAt || new Date(0);
  const support={createdBy:user._id,'history.0':{$exists:true},handledBy:{$ne:user._id}};
  if(unreadOnly) support.updatedAt={$gt:seen};
  const deadline={
    ...scopeForUser(user),status:{$in:['accepted','in_progress','on_hold']},
    followUpAt:{$type:'date',$lte:new Date(),...(unreadOnly?{$gt:seen}:{})}
  };
  return {support,deadline,staff:['admin','operator'].includes(user.role),seen};
}

async function operationCounts(user){
  const {support,deadline,staff}=operationsQueries(user,true);
  const [supportCount,deadlineCount]=await Promise.all([
    SupportRequest.countDocuments(support).limit(100),
    staff ? Case.countDocuments(deadline).limit(100) : 0
  ]);
  return supportCount+deadlineCount;
}

async function operationNotices(user,unreadOnly){
  const {support,deadline,staff,seen}=operationsQueries(user,unreadOnly);
  const [tickets,cases]=await Promise.all([
    SupportRequest.find(support).sort({updatedAt:-1,_id:-1}).limit(10).select('subject status updatedAt').lean(),
    staff ? Case.find(deadline).sort({followUpAt:-1,_id:-1}).limit(10).select('caseCode followUpAt').lean() : []
  ]);
  return [
    ...tickets.map(row=>({id:'support-'+row._id,kind:'support',title:row.subject,status:row.status,
      href:'/support',createdAt:row.updatedAt,unread:row.updatedAt>seen})),
    ...cases.map(row=>({id:'follow-up-'+row._id,kind:'follow_up',title:row.caseCode,
      href:'/cases/'+row._id,createdAt:row.followUpAt,unread:row.followUpAt>seen}))
  ].sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
}

export function installNotificationRoutes(route) {
  route.get('/notifications/count',async(req,res)=>{
    const [[count],operations]=await Promise.all([
      Activity.aggregate([...activityScope(req.user,true),{$limit:100},{$count:'value'}]),
      operationCounts(req.user)
    ]);
    res.json({unreadCount:Math.min(100,(count?.value || 0)+operations)});
  });
  route.get('/notifications',async(req,res)=>{
    const {page,unread}=querySchema.parse(req.query);
    const [[result],operations,count]=await Promise.all([
      Activity.aggregate(notificationPipeline(req.user,page,unread==='1')),
      page===1 ? operationNotices(req.user,unread==='1') : [],
      operationCounts(req.user)
    ]);
    const rows=result?.items || [];
    res.json({
      notifications:rows.slice(0,PAGE_SIZE).map(row=>({
        id:String(row._id),caseId:String(row.caseId),caseCode:row.caseCode,
        debtorName:row.debtorName,kind:row.kind,text:row.text,createdAt:row.createdAt,
        unread:row.unread
      })),
      operations,page,hasMore:rows.length>PAGE_SIZE,
      unreadCount:Math.min(100,(result?.unread?.[0]?.value || 0)+count)
    });
  });
  route.post('/notifications/read',async(req,res)=>{
    // Persisted per-user cursor; no activity record is ever modified.
    // $max prevents concurrent tabs from moving the cursor backwards.
    const seenAt=new Date();
    await User.updateOne({_id:req.user._id},{$max:{notificationsSeenAt:seenAt}});
    res.json({ok:true,seenAt});
  });
}
