/** Single-client timings from a disposable replica-independent fictional database. */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {MongoMemoryServer} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {Organization,User,Case,Receipt,Activity} from '../apps/api/src/models.js';
import {COOKIE_NAME,issueSession} from '../apps/api/src/auth.js';

const mongo=await MongoMemoryServer.create();
let server;
try{
  process.env.JWT_SECRET=randomBytes(32).toString('hex');
  await mongoose.connect(mongo.getUri('collectdesk_benchmark'));
  const [{default:app},org,otherOrg]=await Promise.all([
    import('../apps/api/src/app.js'),
    Organization.create({name:'Benchmark creditor'}),
    Organization.create({name:'Separate benchmark creditor'})
  ]);
  const user=await User.create({name:'Benchmark creditor',email:'benchmark@example.test',passwordHash:'fixture-only',
    role:'creditor',organizationId:org._id});
  const other=await User.create({name:'Benchmark administrator',email:'benchmark-admin@example.test',passwordHash:'fixture-only',
    role:'admin'});
  await Promise.all([Case.init(),Receipt.init(),Activity.init()]);
  server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  const headers={cookie:COOKIE_NAME+'='+issueSession(user)};
  const routes=['/cases','/cases?status=in_progress','/dashboard/summary','/notifications/count'];
  const timings=[];
  let count=0;
  for(const size of [100,1000,20_000]){
    while(count<size){
      const end=Math.min(count+500,size);
      const records=await Case.insertMany(Array.from({length:end-count},(_,offset)=>{
        const id=count+offset;
        return {caseCode:'BENCH-'+id,organizationId:id%5===0?otherOrg._id:org._id,createdBy:user._id,
          debtorName:'Fictional debtor '+id,invoiceNo:'BENCH-'+id,issueDate:new Date('2025-10-01'),
          dueDate:new Date('2025-11-01'),principalPaise:100000+id,status:id%2?'in_progress':'closed'};
      }));
      const withReceipt=records.filter((_,index)=>index%2===1);
      await Receipt.insertMany(withReceipt.map(row=>({caseId:row._id,organizationId:row.organizationId,
        reference:'Fictional-verified',status:'verified',amountPaise:10000,recordedBy:other._id})));
      await Activity.insertMany(records.map(row=>({caseId:row._id,organizationId:row.organizationId,
        actorId:other._id,kind:'assigned',text:'Fictional assignment'})));
      count=end;
    }
    for(const route of routes){
      const request=async()=>{
        const start=performance.now();
        const result=await fetch(base+route,{headers});
        assert.equal(result.status,200);
        const data=await result.json();
        if(route==='/dashboard/summary')assert.equal(data.summary.totalCases,size*0.8);
        return performance.now()-start;
      };
      await request();
      const samples=[];
      for(let i=0;i<7;i++)samples.push(await request());
      samples.sort((a,b)=>a-b);
      timings.push({cases:size,route,medianMs:Math.round(samples[3]*10)/10,maxMs:Math.round(samples[6]*10)/10});
    }
  }
  console.table(timings);
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
}
