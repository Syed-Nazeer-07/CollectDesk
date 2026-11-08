/**
 * Opt-in API integration suite. Runs against a dedicated disposable MongoDB database.
 * In local/offline runs without TEST_MONGODB_URI, it is explicitly SKIPPED.
 * CI starts MongoDB and sets TEST_MONGODB_URI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const uri = process.env.TEST_MONGODB_URI;

test('end-to-end API workflow and authorization (MongoDB required)', {skip: !uri && 'Set TEST_MONGODB_URI to a dedicated test database'}, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  process.env.JWT_SECRET = 'integration-test-only-secret-replace-for-real-production';
  const mongoose = (await import('mongoose')).default;
  const bcrypt = (await import('bcryptjs')).default;
  const {Organization, User, Case, Receipt} = await import('../src/models.js');

  // Hard block before any data deletion. Never run against the demo or production DB.
  const parsed = new URL(uri);
  const database = parsed.pathname.split('/')[1];
  assert.match(database ?? '', /^collectdesk_(?:ci|integration)_test$/,
    'TEST_MONGODB_URI must select collectdesk_ci_test or collectdesk_integration_test');
  await mongoose.connect(uri, {serverSelectionTimeoutMS:10000});
  let server;
  try {
    await mongoose.connection.dropDatabase();
    const app = (await import('../src/app.js')).default;
    const orgA = await Organization.create({name:'Fictional creditor A'});
    const orgB = await Organization.create({name:'Fictional creditor B'});
    const password = 'Test-Only-Password-2026!';
    const passwordHash = await bcrypt.hash(password, 4);
    const makeUser = (name, email, role, organizationId) => User.create({name,email,role,organizationId,passwordHash});
    await Promise.all([
      makeUser('Admin', 'admin@test.collectdesk.local', 'admin'),
      makeUser('Operator', 'operator@test.collectdesk.local', 'operator'),
      makeUser('Creditor A', 'creditora@test.collectdesk.local', 'creditor', orgA._id),
      makeUser('Creditor B', 'creditorb@test.collectdesk.local', 'creditor', orgB._id),
    ]);
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function call(path, {method='GET', cookie, body, origin='http://localhost:3000'}={}) {
      const headers = {};
      if(cookie) headers.cookie = cookie;
      if(body !== undefined) headers['content-type'] = 'application/json';
      if(origin !== null) headers.origin = origin;
      const response = await fetch(`${base}/api/v1${path}`, {method,headers,body: body===undefined?undefined:JSON.stringify(body)});
      return {status:response.status, data:await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0]};
    }
    async function signIn(email) {
      const r = await call('/auth/login',{method:'POST',body:{email,password}});
      assert.equal(r.status,200,JSON.stringify(r.data));
      assert.ok(r.cookie,'login must set session cookie');
      return r.cookie;
    }
    const a = await signIn('creditora@test.collectdesk.local');
    const b = await signIn('creditorb@test.collectdesk.local');
    const admin = await signIn('admin@test.collectdesk.local');
    const operator = await signIn('operator@test.collectdesk.local');
    let r = await call('/cases',{method:'POST',cookie:a,origin:null,body:{}});
    assert.equal(r.status,403,'writes without trusted origin must be denied');
    const invoice = {debtorName:'Demo Industrial Ltd', invoiceNo:'TEST-001', issueDate:'2026-09-01', dueDate:'2026-10-01', principalPaise:1_000_000, description:'Synthetic invoice only', disputed:false, evidenceLabel:''};
    r = await call('/cases',{method:'POST',cookie:a,body:invoice});
    assert.equal(r.status,201,JSON.stringify(r.data));
    const caseId = r.data.id;
    assert.ok(caseId);
    // A creditor can edit their own draft, but never an accepted/submitted claim.
    const editableInvoice={...invoice,description:'Corrected draft description'};
    r = await call(`/cases/${caseId}`,{method:'PATCH',cookie:a,body:editableInvoice});
    assert.equal(r.status,200,'creditor should be able to edit its own draft');
    r = await call(`/cases/${caseId}`,{method:'PATCH',cookie:b,body:editableInvoice});
    assert.equal(r.status,404,'another creditor cannot edit this organization’s draft');
    r = await call(`/cases/${caseId}`,{method:'PATCH',cookie:admin,body:editableInvoice});
    assert.equal(r.status,403,'administrator cannot overwrite creditor invoice fields');

    const futureInvoice={...invoice,invoiceNo:'INV-FUTURE-TEST',issueDate:'2098-01-01',dueDate:'2099-01-01'};
    const future=await call('/cases',{method:'POST',cookie:a,body:futureInvoice});
    assert.equal(future.status,201);
    const futureSubmit=await call(`/cases/${future.data.id}/submit`,{method:'POST',cookie:a});
    assert.equal(futureSubmit.status,422,'future invoices may be drafted but not submitted for collection');
    r = await call(`/cases/${caseId}`,{cookie:b});
    assert.equal(r.status,404,'other creditors must not access private case details');
    r = await call('/cases',{cookie:b});
    assert.equal(r.status,200);
    assert.ok(r.data.cases.every(c=>c.id!==caseId),'other tenant must not see private cases');
    // Server-side search/filter, pagination and input validation.
    r = await call('/cases?limit=1&page=1',{cookie:a});
    assert.equal(r.status,200);
    assert.equal(r.data.pagination.pageSize,1);
    assert.equal(r.data.pagination.total,2);
    assert.equal(r.data.cases.length,1);
    r = await call('/cases?q=TEST-001',{cookie:a});
    assert.equal(r.status,200);
    assert.equal(r.data.cases.length,1);
    r = await call('/cases?q=nomatch',{cookie:a});
    assert.equal(r.data.cases.length,0);
    r = await call('/cases?status=made_up',{cookie:a});
    assert.equal(r.status,422);
    r = await call('/cases?limit=9999',{cookie:a});
    assert.equal(r.status,422);
    r = await call(`/cases/${caseId}`,{cookie:operator});
    assert.equal(r.status,404,'unassigned operator must not see the case');
    r = await call(`/cases/${caseId}/review`,{method:'POST',cookie:admin,body:{decision:'accept',reason:'Test review',feeRateBps:2000}});
    assert.equal(r.status,409,'unsubmitted invoice must not be reviewed');

    r = await call(`/cases/${caseId}/submit`,{method:'POST',cookie:a});
    assert.equal(r.status,200);
    r = await call(`/cases/${caseId}`,{method:'PATCH',cookie:a,body:{...editableInvoice,principalPaise:99_999_999}});
    assert.equal(r.status,409,'submitted invoices must not be editable');
    r = await call(`/cases/${caseId}`,{cookie:a});
    assert.equal(r.data.case.principalPaise,invoice.principalPaise,'rejected edit must not alter invoice principal');
    r = await call(`/cases/${caseId}/submit`,{method:'POST',cookie:a});
    assert.equal(r.status,409,'duplicate submission must be rejected');
    r = await call(`/cases/${caseId}/review`,{method:'POST',cookie:admin,body:{decision:'accept',reason:'Fictional invoice approved',feeRateBps:2000}});
    assert.equal(r.status,200);
    r = await call(`/cases/${caseId}`,{method:'PATCH',cookie:a,body:{...editableInvoice,debtorName:'Attempted accepted edit'}});
    assert.equal(r.status,409,'accepted invoices must not be editable');
    r = await call(`/cases/${caseId}`,{cookie:a});
    assert.equal(r.data.case.debtorName,invoice.debtorName,'accepted invoice fields remain unchanged');
    const op = await User.findOne({role:'operator'});
    r = await call(`/cases/${caseId}/assign`,{method:'POST',cookie:admin,body:{operatorId:String(op._id)}});
    assert.equal(r.status,200);
    r = await call(`/cases/${caseId}`,{cookie:operator});
    assert.equal(r.status,200,'assigned operator must see assigned case');
    r = await call(`/cases/${caseId}/status`,{method:'POST',cookie:a,body:{action:'hold',reason:'Waiting for documents'}});
    assert.equal(r.status,403,'creditor cannot change operational case status');
    r = await call(`/cases/${caseId}/status`,{method:'POST',cookie:admin,body:{action:'hold',reason:'Waiting for documents'}});
    assert.equal(r.status,200,'admin can place an assigned case on hold');
    assert.equal(r.data.status,'on_hold');
    r = await call(`/cases/${caseId}/status`,{method:'POST',cookie:admin,body:{action:'hold',reason:'Duplicate hold'}});
    assert.equal(r.status,409,'a case cannot be put on hold twice');
    r = await call(`/cases/${caseId}/status`,{method:'POST',cookie:admin,body:{action:'resume',reason:'Documents now available'}});
    assert.equal(r.status,200,'admin can resume a held case');
    assert.equal(r.data.status,'in_progress','assigned case must resume to in_progress');
    // A terminal closed case must be recorded as a distinct audited workflow.
    const closing=await call('/cases',{method:'POST',cookie:a,body:{...invoice,invoiceNo:'TEST-CLOSE-002'}});
    assert.equal(closing.status,201);
    const closeId=closing.data.id;
    assert.equal((await call(`/cases/${closeId}/submit`,{method:'POST',cookie:a})).status,200);
    assert.equal((await call(`/cases/${closeId}/review`,{method:'POST',cookie:admin,body:{decision:'accept',reason:'Valid synthetic invoice'}})).status,200);
    r = await call(`/cases/${closeId}/status`,{method:'POST',cookie:admin,body:{action:'close',reason:'Concluded without cash collection'}});
    assert.equal(r.status,200);
    assert.equal(r.data.status,'closed');
    r = await call(`/cases/${closeId}/status`,{method:'POST',cookie:admin,body:{action:'resume',reason:'Invalid resume'}});
    assert.equal(r.status,409,'closed is terminal');
    r = await call(`/cases/${closeId}/receipts`,{method:'POST',cookie:admin,body:{amountPaise:10000,reference:'CLOSED-PAYMENT'}});
    assert.equal(r.status,409,'cannot record a new receipt against a closed case');
    r = await call(`/cases/${caseId}/activity`,{method:'POST',cookie:operator,body:{text:'Internal review, not for creditor',visibility:'internal'}});
    assert.equal(r.status,201);
    r = await call(`/cases/${caseId}/activity`,{method:'POST',cookie:operator,body:{text:'Progress update for the creditor',visibility:'creditor'}});
    assert.equal(r.status,201);
    r = await call(`/cases/${caseId}`,{cookie:a});
    assert.ok(r.data.activities.some(e=>e.text==='Progress update for the creditor'));
    assert.ok(!r.data.activities.some(e=>e.text.includes('Internal review')),'internal updates must remain hidden');

    r = await call(`/cases/${caseId}/receipts`,{method:'POST',cookie:operator,body:{amountPaise:200_000,reference:'DEMO-UTR-1'}});
    assert.equal(r.status,403,'operator must not record receipts');
    r = await call(`/cases/${caseId}/receipts`,{method:'POST',cookie:admin,body:{amountPaise:200_000,reference:'DEMO-UTR-1'}});
    assert.equal(r.status,201,JSON.stringify(r.data));
    const receiptId = r.data.id;
    r = await call(`/cases/${caseId}/status`,{method:'POST',cookie:admin,body:{action:'close',reason:'Close while payment pending'}});
    assert.equal(r.status,409,'pending receipts must be reconciled before closing');
    r = await call(`/cases/${caseId}`,{cookie:a});
    assert.equal(r.data.financials.recoveredPaise,0,'recorded payment must not count as verified');
    assert.equal(r.data.receipts.length,0,'creditor must not see unverified internal receipt references');
    r = await call(`/cases/${caseId}/receipts/${receiptId}/verify`,{method:'POST',cookie:admin});
    assert.equal(r.status,200);
    r = await call(`/cases/${caseId}/receipts/${receiptId}/verify`,{method:'POST',cookie:admin});
    assert.equal(r.status,409,'a receipt cannot be verified twice');
    r = await call(`/cases/${caseId}`,{cookie:a});
    assert.equal(r.data.financials.recoveredPaise,200_000);
    assert.equal(r.data.financials.feePaise,40_000);
    assert.equal(r.data.receipts.length,1,'verified receipt can be shared');
    r = await call(`/cases/${caseId}/receipts/${receiptId}/reverse`,{method:'POST',cookie:admin,body:{reason:'Fictional receipt correction'}});
    assert.equal(r.status,200);
    r = await call(`/cases/${caseId}/receipts/${receiptId}/reverse`,{method:'POST',cookie:admin,body:{reason:'Duplicate correction'}});
    assert.equal(r.status,409,'a verified receipt cannot be reversed twice');
    r = await call(`/cases/${caseId}`,{cookie:a});
    assert.equal(r.data.financials.recoveredPaise,0,'reversal must adjust verified recovery');
    assert.equal(r.data.financials.feePaise,0,'reversal must adjust fee');
    assert.equal((await Case.findById(caseId)).status,'in_progress');
    // Construct contradictory pending data deliberately to simulate concurrent admins or import errors.
    // The per-case lease must prevent both from being verified past the principal.
    const recordedBy = (await User.findOne({role:'admin'}))._id;
    const candidates = await Receipt.create([
      {caseId,organizationId:orgA._id,amountPaise:800_000,reference:'RACE-001',kind:'receipt',status:'recorded',recordedBy},
      {caseId,organizationId:orgA._id,amountPaise:800_000,reference:'RACE-002',kind:'receipt',status:'recorded',recordedBy}
    ]);
    const twoVerifications = await Promise.all(candidates.map(x=>call(`/cases/${caseId}/receipts/${x._id}/verify`,{method:'POST',cookie:admin})));
    assert.equal(twoVerifications.filter(x=>x.status===200).length,1,'only one conflicting verification may succeed');
    assert.ok(twoVerifications.some(x=>[409,422].includes(x.status)),'conflicting verification must be rejected');
    r=await call(`/cases/${caseId}`,{cookie:a});
    assert.equal(r.data.financials.recoveredPaise,800_000,'concurrency must not overstate recovery');
    await t.test('logout sends a clearing cookie', async()=>{
      const logout=await call('/auth/logout',{method:'POST',cookie:a});
      assert.equal(logout.status,200);
      assert.match(logout.cookie||'',/collectdesk_session=/);
    });
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    await mongoose.disconnect();
  }
});
