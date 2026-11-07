import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {Organization,User,Case,Activity,Receipt} from './models.js';
import {formatCaseCode} from './rules.js';
if(!process.env.MONGODB_URI || !process.env.DEMO_SEED_PASSWORD || process.env.DEMO_SEED_PASSWORD.length<12 || process.env.DEMO_SEED_PASSWORD==='change-this-before-seeding'){
  console.error('Set MONGODB_URI and a 12+ character DEMO_SEED_PASSWORD before seeding.');process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI);
const hash=await bcrypt.hash(process.env.DEMO_SEED_PASSWORD,12);
async function org(name){return Organization.findOneAndUpdate({name},{$setOnInsert:{name,country:'IN',active:true}},{upsert:true,returnDocument:'after'});}
async function user(email,name,role,organizationId){return User.findOneAndUpdate({email},{$set:{name,role,organizationId,passwordHash:hash,active:true}},{upsert:true,returnDocument:'after'});}
const [alpha,beta]=await Promise.all([org('Acme Industrial Supplies'),org('Meridian Office Systems')]);
const [admin,operator,alice,bob]=await Promise.all([
  user('admin@demo.collectdesk.test','Avery Morgan','admin'),user('operator@demo.collectdesk.test','Jordan Lee','operator'),
  user('creditor@demo.collectdesk.test','Samira Patel','creditor',alpha._id),user('creditor2@demo.collectdesk.test','Dev Shah','creditor',beta._id)
]);
const samples=[
  {code:'DEMO-1001',org:alpha,creator:alice,debtorName:'Horizon Machinery Ltd',invoiceNo:'INV-2026-0318',principalPaise:24500000,status:'in_progress',assignedTo:operator._id,feeRateBps:2000,days:-32,description:'Industrial components invoice. All information is fictional.'},
  {code:'DEMO-1002',org:alpha,creator:alice,debtorName:'Northstar Logistics',invoiceNo:'INV-2026-0321',principalPaise:12850000,status:'submitted',days:-16,description:'Awaiting internal intake review.'},
  {code:'DEMO-1003',org:alpha,creator:alice,debtorName:'Maplefield Retail Group',invoiceNo:'INV-2026-0326',principalPaise:7900000,status:'accepted',days:-11,description:'Accepted and awaiting operator assignment.'},
  {code:'DEMO-1004',org:alpha,creator:alice,debtorName:'Vantage Infrastructure',invoiceNo:'INV-2026-0330',principalPaise:18600000,status:'needs_info',days:-8,description:'Additional documentation requested.'},
  {code:'DEMO-2001',org:beta,creator:bob,debtorName:'Summit Components Pvt Ltd',invoiceNo:'INV-2026-0491',principalPaise:9400000,status:'submitted',days:-24,description:'Separate tenant — must not appear to Acme users.'}
];
const base=new Date('2026-11-08T00:00:00.000Z');
for(const s of samples){
  const due=new Date(base.getTime()+s.days*86400000);
  const item=await Case.findOneAndUpdate({organizationId:s.org._id,invoiceNo:s.invoiceNo},{$setOnInsert:{caseCode:formatCaseCode(s.code),organizationId:s.org._id,createdBy:s.creator._id,debtorName:s.debtorName,invoiceNo:s.invoiceNo,principalPaise:s.principalPaise,issueDate:new Date(due.getTime()-30*86400000),dueDate:due,status:s.status,assignedTo:s.assignedTo,feeRateBps:s.feeRateBps||2000,description:s.description,submittedAt:base,acceptedAt:s.status==='in_progress'?base:undefined}},{upsert:true,returnDocument:'after'});
  if(!await Activity.exists({caseId:item._id})){
    await Activity.create({caseId:item._id,organizationId:s.org._id,actorId:s.creator._id,kind:'submitted',visibility:'creditor',text:'Invoice submitted for review (fictional demo record).'});
    if(s.status==='in_progress')await Activity.create({caseId:item._id,organizationId:s.org._id,actorId:admin._id,kind:'assigned',visibility:'creditor',text:'Case assigned to Jordan Lee.'});
  }
  if(s.code==='DEMO-1001' && !await Receipt.exists({caseId:item._id})){
    await Receipt.create({caseId:item._id,organizationId:s.org._id,amountPaise:6000000,reference:'DEMO-REC-001',kind:'receipt',status:'verified',recordedBy:admin._id,verifiedBy:admin._id,verifiedAt:base});
    await Activity.create({caseId:item._id,organizationId:s.org._id,actorId:admin._id,kind:'verified',visibility:'creditor',text:'Fictional receipt of ₹60,000 was verified.'});
  }
}
console.log('Seed ready. Users: admin@demo.collectdesk.test, operator@demo.collectdesk.test, creditor@demo.collectdesk.test, creditor2@demo.collectdesk.test');
console.log('All demo passwords are DEMO_SEED_PASSWORD. NEVER use this fixture database for real case information.');
await mongoose.disconnect();
