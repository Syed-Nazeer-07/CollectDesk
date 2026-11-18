import {z} from 'zod';
import {User,DigestDelivery} from './models.js';
import {emailDeliveryProvider,sendWorkspaceDigestEmail} from './email-delivery.js';
import {hasRecentWorkspaceActivity} from './notifications.js';

const dayMs=86_400_000;
const preferences=z.object({emailDigest:z.boolean()}).strict();
function available(){
  const provider=emailDeliveryProvider();
  return process.env.WORKSPACE_DIGEST_ENABLED==='true' && Boolean(provider) && provider!=='console';
}

export function installDigestPreferenceRoutes(app,requireAuth){
  app.get('/api/v1/auth/notification-preferences',requireAuth,(req,res)=>{
    res.json({emailDigest:Boolean(req.user.emailDigestSince),available:available()});
  });
  app.patch('/api/v1/auth/notification-preferences',requireAuth,async(req,res)=>{
    const {emailDigest}=preferences.parse(req.body);
    if(emailDigest&&!available())return res.status(503).json({error:'Workspace digest delivery is unavailable.'});
    const updated=await User.findOneAndUpdate({_id:req.user._id,active:true},{
      $set:{emailDigestSince:emailDigest ? req.user.emailDigestSince || new Date() : null}
    },{returnDocument:'after'});
    if(!updated)return res.status(401).json({error:'Please sign in again.'});
    res.json({emailDigest:Boolean(updated.emailDigestSince),available:available()});
  });
}

export async function sendWorkspaceDigests({origin,now=new Date()}){
  if(!available())throw new Error('Workspace digest delivery is not enabled or configured.');
  if(new URL(origin).origin!==origin)throw new Error('Configure a bare web origin for digest links.');
  await DigestDelivery.init();
  const utcDay=now.toISOString().slice(0,10);
  const report={sent:0,unconfirmed:0};
  const cursor=User.find({active:true,emailDigestSince:{$type:'date'}})
    .select('role organizationId emailDigestSince').lean().cursor({batchSize:50});
  try{
    for await(const user of cursor){
      const previous=await DigestDelivery.findOne({userId:user._id}).sort({utcDay:-1}).select('utcDay through').lean();
      if(previous?.utcDay===utcDay)continue;
      const since=new Date(Math.max(now.getTime()-dayMs,user.emailDigestSince.getTime(),previous?.through.getTime()||0));
      if(!await hasRecentWorkspaceActivity(user,since,now))continue;
      const current=await User.findOne({_id:user._id,active:true,emailDigestSince:user.emailDigestSince})
        .select('email').lean();
      if(!current)continue;
      let delivery;
      try{
        delivery=await DigestDelivery.create({userId:user._id,utcDay,through:now,status:'claimed',
          expiresAt:new Date(now.getTime()+31*dayMs)});
      }catch(error){
        if(error.code===11000)continue;
        throw error;
      }
      // The claim is durable before any external call. An ambiguous outcome
      // is reported for investigation and never automatically sent again.
      let status;
      try{
        await sendWorkspaceDigestEmail(current.email,origin+'/notifications');
        status='sent';
      }catch{
        status='unconfirmed';
      }
      await DigestDelivery.updateOne({_id:delivery._id},{$set:{status}});
      report[status]++;
    }
  } finally {
    await cursor.close();
  }
  return report;
}
