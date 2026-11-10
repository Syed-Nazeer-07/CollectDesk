/**
 * Opt-in API integration suite. Runs against a dedicated disposable MongoDB database.
 * In local/offline runs without TEST_MONGODB_URI, it is explicitly SKIPPED.
 * CI starts MongoDB and sets TEST_MONGODB_URI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';

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
      const cookies=response.headers.getSetCookie?.()||[response.headers.get('set-cookie')].filter(Boolean);
      const chosen=cookies.find(v=>v.startsWith('collectdesk_session=')) || cookies.find(v=>v.startsWith('collectdesk_google_nonce='));
      return {status:response.status, data:await response.json(), cookie:chosen?.split(';')[0]};
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

    await t.test('support request privacy, validation and administrator resolution',async()=>{
      let response=await call('/support/requests');
      assert.equal(response.status,401,'support requires authentication');
      response=await call('/support/requests',{method:'POST',cookie:a,origin:null,
        body:{category:'technical',subject:'Test issue',message:'An example problem for QA only.'}});
      assert.equal(response.status,403,'support intake must enforce origin checks');
      response=await call('/support/requests',{method:'POST',cookie:a,
        body:{category:'technical',subject:'Test issue',message:'An example problem for QA only.',role:'admin'}});
      assert.equal(response.status,422,'clients cannot inject privileged support fields');
      const ticketA=await call('/support/requests',{method:'POST',cookie:a,
        body:{category:'case',subject:'Missing case update',message:'This is a fictional case workflow question.'}});
      assert.equal(ticketA.status,201,JSON.stringify(ticketA.data));
      const ticketB=await call('/support/requests',{method:'POST',cookie:b,
        body:{category:'onboarding',subject:'Workspace help',message:'This fictional company needs workspace guidance.'}});
      assert.equal(ticketB.status,201);
      const aList=await call('/support/requests',{cookie:a});
      assert.equal(aList.status,200);
      assert.deepEqual(aList.data.requests.map(x=>x.id),[ticketA.data.id],
        'creditor A must not see another creditor’s support requests');
      const bList=await call('/support/requests',{cookie:b});
      assert.equal(bList.status,200);
      assert.deepEqual(bList.data.requests.map(x=>x.id),[ticketB.data.id]);
      const opList=await call('/support/requests',{cookie:operator});
      assert.equal(opList.status,200);
      assert.equal(opList.data.requests.length,0,'operators must not see other users’ tickets');
      const admins=await call('/support/requests',{cookie:admin});
      assert.equal(admins.status,200);
      assert.equal(admins.data.requests.length,2,'administrators can triage all support requests');
      assert.ok(admins.data.requests.every(x=>x.reporter?.email));
      response=await call('/support/requests?status=nope',{cookie:admin});
      assert.equal(response.status,422,'support status filter must be validated');
      response=await call('/support/requests/'+ticketA.data.id,{method:'PATCH',cookie:a,
        body:{status:'resolved',resolutionNote:'The issue has been checked and resolved.'}});
      assert.equal(response.status,403,'creditors cannot resolve tickets');
      response=await call('/support/requests/'+ticketA.data.id,{method:'PATCH',cookie:operator,
        body:{status:'resolved',resolutionNote:'The issue has been checked and resolved.'}});
      assert.equal(response.status,403,'operators cannot change support queue status');
      response=await call('/support/requests/'+ticketA.data.id,{method:'PATCH',cookie:admin,
        body:{status:'resolved',resolutionNote:'Too short'}});
      assert.equal(response.status,422,'resolutions need a meaningful note');
      response=await call('/support/requests/'+ticketA.data.id,{method:'PATCH',cookie:admin,
        body:{status:'resolved',resolutionNote:'We corrected the case settings and verified the outcome.'}});
      assert.equal(response.status,200);
      const resolved=await call('/support/requests?status=resolved',{cookie:a});
      assert.equal(resolved.data.requests.length,1);
      assert.match(resolved.data.requests[0].resolutionNote,/verified the outcome/);
      const otherResolved=await call('/support/requests?status=resolved',{cookie:b});
      assert.equal(otherResolved.data.requests.length,0);
    });

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
    const erroneous=await call(`/cases/${caseId}/receipts`,{method:'POST',cookie:admin,body:{amountPaise:10_000,reference:'INCORRECT-PENDING'}});
    assert.equal(erroneous.status,201,'additional synthetic pending receipt recorded');
    r = await call(`/cases/${caseId}/receipts/${erroneous.data.id}/reject`,{method:'POST',cookie:operator,body:{reason:'Invalid reference'}});
    assert.equal(r.status,403,'operator cannot reject pending receipts');
    r = await call(`/cases/${caseId}/receipts/${erroneous.data.id}/reject`,{method:'POST',cookie:admin,body:{reason:'Incorrect fictional reference'}});
    assert.equal(r.status,200,'admin can reject incorrect pending receipt');
    r = await call(`/cases/${caseId}/receipts/${erroneous.data.id}/reject`,{method:'POST',cookie:admin,body:{reason:'Duplicate rejection'}});
    assert.equal(r.status,409,'rejected receipt cannot be processed twice');
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
    await t.test('verified registration creates creditor-only tenants and Google sign-in requires one-time verified credentials',async()=>{
      const originalFetch=globalThis.fetch;
      const originalEnv=Object.fromEntries(
        ['PUBLIC_REGISTRATION_ENABLED','RESEND_API_KEY','AUTH_FROM_EMAIL','GOOGLE_CLIENT_ID']
          .map(k=>[k,process.env[k]])
      );
      const sent=[];
      const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
      const jwk={...publicKey.export({format:'jwk'}),kid:'local-ci-kid',alg:'RS256',use:'sig'};
      try{
        process.env.PUBLIC_REGISTRATION_ENABLED='false';
        let result=await call('/auth/options');
        assert.equal(result.data.emailSignupEnabled,false,'self signup must default disabled');
        assert.equal(result.data.googleEnabled,false,'Google must default disabled');
        result=await call('/auth/register',{method:'POST',body:{}});
        assert.equal(result.status,503,'unconfigured registration must refuse to create accounts');
        process.env.PUBLIC_REGISTRATION_ENABLED='true';
        process.env.RESEND_API_KEY='test-key-never-send';
        process.env.AUTH_FROM_EMAIL='CollectDesk <ci@example.test>';
        process.env.GOOGLE_CLIENT_ID='ci-google-client';
        globalThis.fetch=async(url,opts)=>{
          if(String(url)==='https://api.resend.com/emails'){
            sent.push(JSON.parse(opts.body));
            return new Response(JSON.stringify({id:'test-only'}),{status:200,headers:{'content-type':'application/json'}});
          }
          if(String(url)==='https://www.googleapis.com/oauth2/v3/certs'){
            return new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'content-type':'application/json'}});
          }
          return originalFetch(url,opts);
        };
        result=await call('/auth/options');
        assert.equal(result.data.emailSignupEnabled,true);
        assert.equal(result.data.googleEnabled,true);
        assert.equal(result.data.googleClientId,'ci-google-client');
        const registration={
          name:'New Fictional Creditor',organizationName:'New Fictional Company',
          email:'new-user@collectdesk-ci.test',password:'SecureTestPassword2026'
        };
        result=await call('/auth/register',{method:'POST',body:{...registration,role:'admin'}});
        assert.equal(result.status,422,'public signup cannot accept privileged role fields');
        result=await call('/auth/register',{method:'POST',body:registration,origin:null});
        assert.equal(result.status,403,'signup requires allowed request Origin');
        result=await call('/auth/register',{method:'POST',body:registration});
        assert.equal(result.status,202);
        assert.equal(sent.length,1,'registered email should receive a verification link');
        assert.equal(await User.exists({email:registration.email}),null,'unverified email must not become an active user');
        const link=sent[0].text.match(/signup\/verify\?token=([A-Za-z0-9_-]+)/);
        assert.ok(link,'email must contain a verification token');
        result=await call('/auth/verify-email',{method:'POST',body:{token:link[1]}});
        assert.equal(result.status,201,JSON.stringify(result.data));
        assert.equal(result.data.user.role,'creditor');
        assert.ok(result.data.user.organizationId,'verified creditor gets their own company scope');
        const registeredCookie=result.cookie;
        result=await call('/auth/verify-email',{method:'POST',body:{token:link[1]}});
        assert.equal(result.status,400,'email tokens are single-use');
        result=await call('/cases',{cookie:registeredCookie});
        assert.equal(result.status,200);
        assert.equal(result.data.cases.length,0,'registered company must not inherit demo creditors cases');
        result=await call('/operators',{cookie:registeredCookie});
        assert.equal(result.status,403,'new creditor cannot view privileged staff lists');

        // Password recovery must never disclose whether an email is registered.
        let recover=await call('/auth/password/options');
        assert.equal(recover.status,200);
        assert.equal(recover.data.enabled,true);
        const sentBeforeReset=sent.length;
        recover=await call('/auth/password/forgot',{
          method:'POST',body:{email:'no-such-user@collectdesk-ci.test'}
        });
        assert.equal(recover.status,202);
        assert.equal(sent.length,sentBeforeReset,'unknown accounts must not receive email');
        recover=await call('/auth/password/forgot',{
          method:'POST',body:{email:registration.email}
        });
        assert.equal(recover.status,202);
        assert.equal(sent.length,sentBeforeReset+1,'existing account must receive reset link');
        const resetLink=sent.at(-1).text.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
        assert.ok(resetLink,'reset email should contain a unique token');
        const token=resetLink[1];
        assert.equal((await call('/auth/password/reset',{
          method:'POST',body:{token,password:'weak'}
        })).status,422,'weak reset passwords must be rejected');
        recover=await call('/auth/password/reset',{
          method:'POST',body:{token,password:'NewSecurePassword2026!'}
        });
        assert.equal(recover.status,200,JSON.stringify(recover.data));
        assert.equal((await call('/auth/me',{cookie:registeredCookie})).status,401,
          'password reset must invalidate previously signed sessions');
        assert.equal((await call('/auth/password/reset',{
          method:'POST',body:{token,password:'AnotherPassword2026!'}
        })).status,400,'recovery links must be single-use');
        assert.equal((await call('/auth/login',{method:'POST',body:{
          email:registration.email,password:registration.password
        }})).status,401,'the previous password must stop working');
        const freshLogin=await call('/auth/login',{method:'POST',body:{
          email:registration.email,password:'NewSecurePassword2026!'
        }});
        assert.equal(freshLogin.status,200,'reset password must permit sign-in');
        assert.equal((await call('/auth/me',{cookie:freshLogin.cookie})).status,200);
        assert.equal(freshLogin.data.user.role,'creditor','recovery must never alter roles');

        const nonce=await call('/auth/google/nonce');
        assert.equal(nonce.status,200,JSON.stringify(nonce.data));
        assert.ok(nonce.cookie?.startsWith('collectdesk_google_nonce='));
        const head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url');
        const claims=Buffer.from(JSON.stringify({
          iss:'https://accounts.google.com',aud:'ci-google-client',sub:'ci-new-google-account',
          email:'new-google@collectdesk-ci.test',email_verified:true,name:'Google Demo User',
          nonce:nonce.data.nonce,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600
        })).toString('base64url');
        const credential=head+'.'+claims+'.'+sign('RSA-SHA256',Buffer.from(head+'.'+claims),privateKey).toString('base64url');
        result=await call('/auth/google',{method:'POST',cookie:nonce.cookie,body:{credential}});
        assert.equal(result.status,200,JSON.stringify(result.data));
        assert.equal(result.data.user.role,'creditor');
        assert.equal(result.data.user.organizationId,null,'Google account needs explicit company onboarding');
        const googleCookie=result.cookie;
        result=await call('/auth/google',{method:'POST',cookie:nonce.cookie,body:{credential}});
        assert.equal(result.status,401,'Google nonce cannot be replayed');
        result=await call('/cases',{cookie:googleCookie});
        assert.equal(result.status,403,'Google user cannot use case endpoints without a company');
        result=await call('/support/requests',{method:'POST',cookie:googleCookie,
          body:{category:'onboarding',subject:'Help with setup',
            message:'I cannot finish the fictional company setup process.'}});
        assert.equal(result.status,201,'a verified Google user must be able to request onboarding support');
        result=await call('/support/requests',{cookie:googleCookie});
        assert.equal(result.status,200);
        assert.equal(result.data.requests.length,1);
        result=await call('/auth/organization',{method:'POST',cookie:googleCookie,
          body:{organizationName:'New Google Fictional Company',role:'admin'}});
        assert.equal(result.status,422,'company onboarding must not accept role escalation');
        result=await call('/auth/organization',{method:'POST',cookie:googleCookie,
          body:{organizationName:'New Google Fictional Company'}});
        assert.equal(result.status,200);
        assert.ok(result.data.user.organizationId);
        result=await call('/cases',{cookie:googleCookie});
        assert.equal(result.status,200);
        assert.equal(result.data.cases.length,0,'Google new company cannot see seeded records');
        result=await call('/auth/organization',{method:'POST',cookie:googleCookie,
          body:{organizationName:'Duplicate organization'}});
        assert.equal(result.status,409,'onboarding is one-time only');
      }finally{
        globalThis.fetch=originalFetch;
        for(const [k,v] of Object.entries(originalEnv)){
          if(v===undefined)delete process.env[k];else process.env[k]=v;
        }
      }
    });
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
