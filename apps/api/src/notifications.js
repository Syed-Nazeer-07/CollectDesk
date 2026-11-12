import {z} from 'zod';
import {Activity,Case,User} from './models.js';

const KINDS = ['submitted','review','assigned','status','note','verified','reversal','receipt','receipt_rejected','updated'];
const querySchema = z.object({page:z.coerce.number().int().min(1).max(100).default(1)}).strict();
const PAGE_SIZE = 20;

/**
 * Query the existing append-only case activity trail; do not create a second
 * notification store that could disagree with the case timeline.
 * Access is checked against the CURRENT case assignment/company on every read.
 */
export function notificationPipeline(user,page=1) {
  const match={kind:{$in:KINDS},actorId:{$ne:user._id}};
  if(user.role==='creditor') {
    match.visibility='creditor';
    if(user.organizationId) match.organizationId=user.organizationId;
  }
  const access=user.role==='admin'?{}:
    user.role==='creditor'?{'case.organizationId':user.organizationId}:
    user.role==='operator'?{'case.assignedTo':user._id}:
    {_id:{$exists:false}};
  const seenAt=user.notificationsSeenAt || new Date(0);
  return [
    {$match:match},
    {$lookup:{from:Case.collection.name,localField:'caseId',foreignField:'_id',as:'case'}},
    {$unwind:'$case'},
    {$match:access},
    {$facet:{
      items:[
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

export function installNotificationRoutes(route) {
  route.get('/notifications',async(req,res)=>{
    const {page}=querySchema.parse(req.query);
    const [result]=await Activity.aggregate(notificationPipeline(req.user,page));
    const rows=result?.items || [];
    res.json({
      notifications:rows.slice(0,PAGE_SIZE).map(row=>({
        id:String(row._id),caseId:String(row.caseId),caseCode:row.caseCode,
        debtorName:row.debtorName,kind:row.kind,text:row.text,createdAt:row.createdAt,
        unread:row.unread
      })),
      page,hasMore:rows.length>PAGE_SIZE,
      unreadCount:result?.unread?.[0]?.value || 0
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
