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
  const {Organization, User, Case, Activity, Receipt, RevokedSession} = await import('../src/models.js');

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
    const {assertTransactionTopology}=await import('../src/ledger.js');
    await assertTransactionTopology(mongoose.connection);
    await Promise.all([Case.init(),Receipt.init(),Activity.init(),RevokedSession.init()]);
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
    await t.test('profile changes persist for the signed-in user only', async () => {
      const path='/auth/me';
      const patch=(cookie,body)=>call(path,{method:'PATCH',cookie,body});
      assert.equal((await patch(undefined,{name:'Test Name'})).status,401);
      assert.equal((await patch(a,{name:' '})).status,422);
      assert.equal((await patch(a,{name:'Test Name',role:'admin'})).status,422);
      const result=await patch(a,{name:'  Fictional Reviewer  '});
      assert.equal(result.status,200);
      assert.equal(result.data.user.name,'Fictional Reviewer');
      assert.equal((await call(path,{cookie:a})).data.user.name,'Fictional Reviewer');
      assert.equal((await call(path,{cookie:b})).data.user.name,'Creditor B');
      await patch(a,{name:'Creditor A'});
    });
    await t.test('notifications enforce live role scope, hide internal notes, and persist unread state',async()=>{
      const creditorA=await User.findOne({email:'creditora@test.collectdesk.local'});
      const creditorB=await User.findOne({email:'creditorb@test.collectdesk.local'});
      const adminUser=await User.findOne({email:'admin@test.collectdesk.local'});
      const operatorUser=await User.findOne({email:'operator@test.collectdesk.local'});
      const caseA=await Case.create({
        caseCode:'CC-NOTIFY-A',organizationId:orgA._id,createdBy:creditorA._id,
        debtorName:'Sample notification A',invoiceNo:'NOTIFY-A',
        issueDate:new Date('2026-01-01'),dueDate:new Date('2026-02-01'),
        principalPaise:50000,status:'in_progress',assignedTo:operatorUser._id
      });
      const caseB=await Case.create({
        caseCode:'CC-NOTIFY-B',organizationId:orgB._id,createdBy:creditorB._id,
        debtorName:'Sample notification B',invoiceNo:'NOTIFY-B',
        issueDate:new Date('2026-01-01'),dueDate:new Date('2026-02-01'),
        principalPaise:60000,status:'submitted'
      });
      try{
        await Activity.create([
          {caseId:caseA._id,organizationId:orgA._id,actorId:adminUser._id,kind:'review',visibility:'creditor',text:'Accepted for testing.'},
          {caseId:caseA._id,organizationId:orgA._id,actorId:adminUser._id,kind:'note',visibility:'internal',text:'Internal-only secret.'},
          {caseId:caseA._id,organizationId:orgA._id,actorId:operatorUser._id,kind:'note',visibility:'creditor',text:'Operator update.'},
          {caseId:caseB._id,organizationId:orgB._id,actorId:creditorB._id,kind:'submitted',visibility:'creditor',text:'Other tenant update.'}
        ]);
        let result=await call('/notifications',{cookie:a});
        assert.equal(result.status,200,JSON.stringify(result.data));
        assert.equal(result.data.unreadCount,2,'creditor should see admin review and operator note only');
        assert.equal((await call('/notifications/count',{cookie:a})).data.unreadCount,result.data.unreadCount);
        let unreadOnly=await call('/notifications?unread=1',{cookie:a});
        assert.equal(unreadOnly.status,200);
        assert.equal(unreadOnly.data.notifications.length,2);
        assert.ok(unreadOnly.data.notifications.every(n=>n.unread));
        assert.ok(result.data.notifications.every(n=>n.caseId===String(caseA._id)));
        assert.ok(!JSON.stringify(result.data).includes('Internal-only secret'));
        assert.ok(!JSON.stringify(result.data).includes('Other tenant update'));
        result=await call('/notifications',{cookie:operator});
        assert.equal(result.status,200);
        assert.equal(result.data.notifications.length,2,'operator sees current assignment, excluding their own event');
        assert.ok(result.data.notifications.every(n=>n.caseId===String(caseA._id)));
        result=await call('/notifications',{cookie:admin});
        assert.equal(result.status,200);
        assert.ok(result.data.notifications.some(n=>n.caseId===String(caseB._id)));
        assert.ok(!result.data.notifications.some(n=>n.text==='Internal-only secret'),'do not alert actor of own updates');
        result=await call('/notifications/read',{method:'POST',cookie:a});
        assert.equal(result.status,200);
        result=await call('/notifications',{cookie:a});
        assert.equal(result.data.unreadCount,0);
        assert.ok(result.data.notifications.every(n=>n.unread===false));
        unreadOnly=await call('/notifications?unread=1',{cookie:a});
        assert.equal(unreadOnly.data.notifications.length,0,'read items must leave unread-only feed');
        assert.equal(unreadOnly.data.unreadCount,0);
        await Activity.create({caseId:caseA._id,organizationId:orgA._id,actorId:adminUser._id,
          kind:'status',visibility:'creditor',text:'A newer update.'});
        unreadOnly=await call('/notifications?unread=1',{cookie:a});
        assert.equal(unreadOnly.data.notifications.length,1,'new updates appear after marking all read');
        assert.equal(unreadOnly.data.notifications[0].text,'A newer update.');
        assert.equal((await call('/notifications/read',{method:'POST'})).status,401,'read cursor requires authentication');
        assert.equal((await call('/notifications?page=0',{cookie:a})).status,422,'pagination must be validated');
        assert.equal((await call('/notifications?unread=invalid',{cookie:a})).status,422,'filter must be validated');
        await Case.updateOne({_id:caseA._id},{$unset:{assignedTo:1}});
        result=await call('/notifications',{cookie:operator});
        assert.equal(result.data.notifications.length,0,'reassigned operator must lose old case visibility');
      }finally{
        await Activity.deleteMany({caseId:{$in:[caseA._id,caseB._id]}});
        await Case.deleteMany({_id:{$in:[caseA._id,caseB._id]}});
      }
    });

    await t.test('account and case APIs are never cached by shared proxies',async()=>{
      const me=await fetch(base+'/api/v1/auth/me',{headers:{cookie:a}});
      assert.equal(me.status,200);
      assert.match(me.headers.get('cache-control')||'',/private/i);
      assert.match(me.headers.get('cache-control')||'',/no-store/i);
      const release=await fetch(base+'/api/v1/meta/release');
      assert.equal(release.status,200);
      assert.match(release.headers.get('cache-control')||'',/no-store/i);
    });
    await t.test('release metadata exposes version but never secrets',async()=>{
      const release=await call('/meta/release');
      assert.equal(release.status,200);
      assert.equal(release.data.product,'CollectDesk');
      assert.equal(release.data.database,'connected');
      assert.ok(release.data.version);
      assert.ok(!JSON.stringify(release.data).includes(process.env.JWT_SECRET),
        'public release metadata must never include secrets');
    });

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
        body:{status:'resolved',resolutionNote:'We corrected the case settings and verified the outcome.',expectedUpdatedAt:aList.data.requests[0].updatedAt}});
      assert.equal(response.status,200);
      const resolved=await call('/support/requests?status=resolved',{cookie:a});
      assert.equal(resolved.data.requests.length,1);
      assert.match(resolved.data.requests[0].resolutionNote,/verified the outcome/);
      assert.equal(resolved.data.requests[0].history.length,1,
        'admin decisions should create an auditable history entry');
      response=await call('/support/requests/'+ticketA.data.id,{method:'PATCH',cookie:admin,
        body:{status:'in_progress',expectedUpdatedAt:aList.data.requests[0].updatedAt}});
      assert.equal(response.status,409,'stale triage must not overwrite a newer decision');
      const otherResolved=await call('/support/requests?status=resolved',{cookie:b});
      assert.equal(otherResolved.data.requests.length,0);
      response=await call('/support/requests/'+ticketA.data.id,{method:'PATCH',cookie:admin,
        body:{status:'in_progress'}});
      assert.equal(response.status,200);
      const reopened=await call('/support/requests?status=in_progress',{cookie:a});
      assert.equal(reopened.data.requests.length,1);
      assert.equal(reopened.data.requests[0].history.length,2,
        'reopening must append history without erasing the prior resolution');
      assert.match(reopened.data.requests[0].history[0].note,/verified the outcome/);
      assert.equal(reopened.data.requests[0].history[1].status,'in_progress');
    });


    await t.test('operator invitations: admin-only, private tokens, email activation and replay protection',async()=>{
      const {StaffInvite}=await import('../src/models.js');
      const priorEnv={BREVO_API_KEY:process.env.BREVO_API_KEY,BREVO_FROM_EMAIL:process.env.BREVO_FROM_EMAIL,
        RESEND_API_KEY:process.env.RESEND_API_KEY,AUTH_FROM_EMAIL:process.env.AUTH_FROM_EMAIL,
        PUBLIC_REGISTRATION_ENABLED:process.env.PUBLIC_REGISTRATION_ENABLED};
      const originalFetch=globalThis.fetch;
      const sent=[];
      process.env.BREVO_API_KEY='ci-invitation-key';
      process.env.BREVO_FROM_EMAIL='collectdesk-test@example.test';
      delete process.env.RESEND_API_KEY;delete process.env.AUTH_FROM_EMAIL;
      globalThis.fetch=async (url,options)=>{
        if(typeof url==='string'&&url==='https://api.brevo.com/v3/smtp/email'){
          sent.push(JSON.parse(options.body));
          return new Response(JSON.stringify({messageId:'ci-only'}),{status:201,headers:{'content-type':'application/json'}});
        }
        return originalFetch(url,options);
      };
      try{
        let r=await call('/staff/invitations');
        assert.equal(r.status,401,'anonymous users cannot list staff invitations');
        r=await call('/staff/invitations',{cookie:a});
        assert.equal(r.status,403,'creditors cannot list operator invitations');
        r=await call('/staff/invitations',{cookie:operator});
        assert.equal(r.status,403,'operators cannot manage invitations');
        r=await call('/staff/invitations',{method:'POST',cookie:a,
          body:{role:'operator',email:'new.operator@test.collectdesk.local'}});
        assert.equal(r.status,403,'creditors cannot invite staff');
        r=await call('/staff/invitations',{method:'POST',cookie:admin,
          body:{role:'admin',email:'new.operator@test.collectdesk.local'}});
        assert.equal(r.status,422,'admin invitations cannot create additional administrators');
        r=await call('/staff/invitations',{method:'POST',cookie:admin,
          body:{role:'operator',email:'creditora@test.collectdesk.local'}});
        assert.equal(r.status,409,'existing users cannot be re-invited');
        r=await call('/staff/invitations',{method:'POST',cookie:admin,origin:null,
          body:{role:'operator',email:'new.operator@test.collectdesk.local'}});
        assert.equal(r.status,403,'invites must enforce CSRF origin');
        r=await call('/staff/invitations',{method:'POST',cookie:admin,
          body:{role:'operator',email:'new.operator@test.collectdesk.local'}});
        assert.equal(r.status,201,JSON.stringify(r.data));
        assert.equal(sent.length,1,'operator invite email should be dispatched');
        assert.match(sent[0].textContent,/case operator/i);
        const match=sent[0].textContent.match(/\/staff\/activate#token=([A-Za-z0-9_-]+)/);
        assert.ok(match,'email must contain a one-time invitation link');
        const token=match[1];
        assert.ok(token.length>35);
        r=await call('/staff/invitations',{cookie:admin});
        assert.equal(r.status,200);
        assert.equal(r.data.invitations.length,1);
        assert.equal(r.data.invitations[0].role,'operator');
        assert.equal(JSON.stringify(r.data).includes(token),false,'token must never appear in listing');
        assert.equal(JSON.stringify(r.data).includes('tokenHash'),false,'token hash must not be disclosed');
        r=await call('/staff/invitations',{method:'POST',cookie:admin,
          body:{role:'operator',email:'new.operator@test.collectdesk.local'}});
        assert.equal(r.status,409,'do not resend active invitation indefinitely');
        r=await call('/auth/staff-invite/inspect',{method:'POST',body:{token}});
        assert.equal(r.status,200,JSON.stringify(r.data));
        assert.equal(r.data.role,'operator');
        r=await call('/auth/staff-invite/accept',{method:'POST',
          body:{token,name:'Invited Person',password:'short'}});
        assert.equal(r.status,422,'operator passwords must be strong');
        r=await call('/auth/staff-invite/accept',{method:'POST',
          body:{token,name:'Invited Person',password:'StrongTestPassword2026!',role:'admin'}});
        assert.equal(r.status,422,'roles cannot be added to activation payload');
        r=await call('/auth/staff-invite/accept',{method:'POST',
          body:{token,name:'Invited Operator',password:'StrongTestPassword2026!'}});
        assert.equal(r.status,201,JSON.stringify(r.data));
        assert.equal(r.data.user.role,'operator');
        const newOperatorCookie=r.cookie;
        assert.ok(newOperatorCookie,'activation should sign in the invited operator');
        r=await call('/auth/me',{cookie:newOperatorCookie});
        assert.equal(r.status,200);
        assert.equal(r.data.user.role,'operator');
        r=await call('/cases',{cookie:newOperatorCookie});
        assert.equal(r.status,200);
        assert.equal(r.data.cases.length,0,'new operator cannot view unassigned cases');
        r=await call('/staff/invitations',{cookie:newOperatorCookie});
        assert.equal(r.status,403,'new operator still cannot manage staff');
        r=await call('/auth/staff-invite/accept',{method:'POST',
          body:{token,name:'Invited Operator Again',password:'StrongTestPassword2026!'}});
        assert.equal(r.status,400,'used tokens must never be accepted twice');
        r=await call('/auth/staff-invite/inspect',{method:'POST',body:{token}});
        assert.equal(r.status,404,'used invite token must not be visible');
        r=await call('/staff/invitations',{method:'POST',cookie:admin,
          body:{role:'operator',email:'revoked.operator@test.collectdesk.local'}});
        assert.equal(r.status,201);
        const revokedToken=sent[1].textContent.match(/\/staff\/activate#token=([A-Za-z0-9_-]+)/)[1];
        r=await call('/staff/invitations/'+r.data.id+'/revoke',{method:'POST',cookie:a});
        assert.equal(r.status,403);
        const revokedId=(await StaffInvite.findOne({email:'revoked.operator@test.collectdesk.local'}))._id;
        r=await call('/staff/invitations/'+revokedId+'/revoke',{method:'POST',cookie:admin});
        assert.equal(r.status,200);
        r=await call('/auth/staff-invite/inspect',{method:'POST',body:{token:revokedToken}});
        assert.equal(r.status,404,'revoked links must be unusable');
        r=await call('/staff/invitations',{method:'POST',cookie:admin,
          body:{role:'operator',email:'expired.operator@test.collectdesk.local'}});
        assert.equal(r.status,201);
        const expiredToken=sent[2].textContent.match(/\/staff\/activate#token=([A-Za-z0-9_-]+)/)[1];
        await StaffInvite.updateOne({email:'expired.operator@test.collectdesk.local'},
          {$set:{expiresAt:new Date(Date.now()-1000)}});
        r=await call('/auth/staff-invite/accept',{method:'POST',
          body:{token:expiredToken,name:'Expired Invite',password:'StrongTestPassword2026!'}});
        assert.equal(r.status,400,'expired links must be rejected');
      }finally{
        globalThis.fetch=originalFetch;
        for(const [k,v] of Object.entries(priorEnv))if(v===undefined)delete process.env[k];else process.env[k]=v;
      }
    });

    let r = await call('/cases',{method:'POST',cookie:a,origin:null,body:{}});
    assert.equal(r.status,403,'writes without trusted origin must be denied');
    const invoice = {debtorName:'Demo Industrial Ltd', invoiceNo:'TEST-001', issueDate:'2026-09-01', dueDate:'2026-10-01', principalPaise:1_000_000, description:'Synthetic invoice only', disputed:false, evidenceLabel:''};
    r = await call('/cases',{method:'POST',cookie:a,body:invoice});
    assert.equal(r.status,201,JSON.stringify(r.data));
    const caseId = r.data.id;
    assert.ok(caseId);
    await t.test('disabled tenant cannot access cases and cross-tenant mutations fail closed',async()=>{
      try{
        await Organization.updateOne({_id:orgA._id},{$set:{active:false}});
        assert.equal((await call('/cases',{cookie:a})).status,403);
        assert.equal((await call('/dashboard/summary',{cookie:a})).status,403);
        assert.equal((await call(`/cases/${caseId}`,{cookie:a})).status,403);
        assert.equal((await call('/support/requests',{cookie:a})).status,200,'inactive tenant can still seek support');
      }finally{await Organization.updateOne({_id:orgA._id},{$set:{active:true}});}
      for(const suffix of ['submit','review','assign','status','activity','receipts']){
        assert.equal((await call(`/cases/${caseId}/${suffix}`,{method:'POST',cookie:b,body:{}})).status,404);
      }
      assert.equal((await call('/operators',{cookie:a})).status,403);
      assert.equal((await call('/operators',{cookie:operator})).status,403);
    });
    await t.test('private synthetic PDF evidence is strictly scoped and guarded',async()=>{
      const previous=process.env.SAMPLE_EVIDENCE_ENABLED;
      const sample=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
      const path='/cases/'+caseId+'/evidence';
      const send=async(cookie,data=sample)=>{
        const response=await fetch(base+'/api/v1'+path,{
          method:'POST',headers:{cookie,origin:'http://localhost:3000',
            'content-type':'application/pdf','x-file-name':'fictional-invoice.pdf'},
          body:data
        });
        const body=await response.json();
        return {status:response.status,data:body};
      };
      try{
        delete process.env.SAMPLE_EVIDENCE_ENABLED;
        let response=await call(path,{cookie:a});
        assert.equal(response.status,200);
        assert.equal(response.data.enabled,false,'evidence feature must default to disabled');
        process.env.SAMPLE_EVIDENCE_ENABLED='true';
        response=await send(a,Buffer.from('not a PDF'));
        assert.equal(response.status,422,'unsupported file bytes must be rejected');
        response=await send(a,Buffer.alloc(1024*1024+5,0x41));
        assert.equal(response.status,413,'oversized PDF must be rejected before persistence');
        response=await send(b);
        assert.equal(response.status,404,'other creditor cannot upload against this case');
        response=await send(operator);
        assert.equal(response.status,404,'unassigned operator must not upload');
        response=await send(a);
        assert.equal(response.status,201,JSON.stringify(response.data));
        const fileId=response.data.id;
        assert.ok(fileId,'upload should return a private file identifier');
        let listing=await call(path,{cookie:a});
        assert.equal(listing.status,200);
        assert.equal(listing.data.enabled,true);
        assert.equal(listing.data.files.length,1);
        assert.equal(listing.data.files[0].name,'fictional-invoice.pdf');
        listing=await call(path,{cookie:admin});
        assert.equal(listing.data.files.length,1,'admins may inspect attached synthetic evidence');
        listing=await call(path,{cookie:b});
        assert.equal(listing.status,404,'tenant B cannot list tenant A files');
        let download=await fetch(base+'/api/v1'+path+'/'+fileId,{headers:{cookie:admin}});
        assert.equal(download.status,200);
        assert.match(download.headers.get('content-disposition')||'',/attachment/);
        assert.equal(download.headers.get('content-type'),'application/octet-stream');
        assert.equal(Buffer.compare(Buffer.from(await download.arrayBuffer()),sample),0);
        download=await fetch(base+'/api/v1'+path+'/'+fileId,{headers:{cookie:b}});
        assert.equal(download.status,404,'cross-tenant evidence download must be blocked');
        let deletion=await call(path+'/'+fileId,{method:'DELETE',cookie:admin});
        assert.equal(deletion.status,403,'admin cannot remove creditor evidence');
        deletion=await call(path+'/'+fileId,{method:'DELETE',cookie:b});
        assert.equal(deletion.status,404,'another creditor cannot delete evidence');
        deletion=await call(path+'/'+fileId,{method:'DELETE',cookie:a});
        assert.equal(deletion.status,200,'draft owner may remove sample PDF');
        listing=await call(path,{cookie:a});
        assert.equal(listing.data.files.length,0);
        // A storage quota check done before writing must stay correct even when
        // several uploads arrive simultaneously.
        for(let i=0;i<2;i++){
          const added=await send(a);
          assert.equal(added.status,201,'the first two sample files fit the quota');
        }
        const racing=await Promise.all([send(a),send(a)]);
        assert.equal(racing.filter(x=>x.status===201).length,1,
          'concurrent uploads must not exceed the three-file quota');
        assert.ok(racing.some(x=>x.status===409),'excess concurrent upload should be rejected');
        listing=await call(path,{cookie:a});
        assert.equal(listing.data.files.length,3);
        const extra=await send(a);
        assert.equal(extra.status,409,'the fourth sample file must be rejected');
        await Case.updateOne({_id:caseId},{$set:{
          financialLockToken:'held-by-test',financialLockExpiresAt:new Date(Date.now()+60_000)
        }});
        const submittedDuringUpload=await call('/cases/'+caseId+'/submit',{method:'POST',cookie:a});
        assert.equal(submittedDuringUpload.status,409,'an active attachment lease must block submission');
        await Case.updateOne({_id:caseId,financialLockToken:'held-by-test'},
          {$set:{financialLockToken:null,financialLockExpiresAt:null}});
      }finally{
        if(previous===undefined)delete process.env.SAMPLE_EVIDENCE_ENABLED;
        else process.env.SAMPLE_EVIDENCE_ENABLED=previous;
      }
    });
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
    r = await call('/cases?sort=due',{cookie:a});
    assert.equal(r.status,200);
    assert.equal(r.data.cases[0].invoiceNo,'TEST-001','earliest due case should appear first');
    r = await call('/cases?sort=amount',{cookie:a});
    assert.equal(r.status,200);
    r = await call('/cases?sort=bad-value',{cookie:a});
    assert.equal(r.status,422,'sort input must use a validated allowlist');
    const publicExport=await fetch(base+'/api/v1/cases/export');
    assert.equal(publicExport.status,401,'anonymous users cannot export the register');
    const ownExport=await fetch(base+'/api/v1/cases/export?q=TEST-001',{headers:{cookie:a}});
    assert.equal(ownExport.status,200);
    assert.match(ownExport.headers.get('content-disposition')||'',/attachment/);
    assert.match(ownExport.headers.get('cache-control')||'',/no-store/);
    const exported=await ownExport.text();
    assert.match(exported,/TEST-001/);
    assert.doesNotMatch(exported,/INV-FUTURE-TEST/,'export search must be applied across every row');
    const foreignExport=await fetch(base+'/api/v1/cases/export',{headers:{cookie:b}});
    assert.equal(foreignExport.status,200);
    assert.doesNotMatch(await foreignExport.text(),/TEST-001/,
      'tenant B must not be able to export tenant A case data');
    r = await call('/cases/export?sort=invalid',{cookie:a});
    assert.equal(r.status,422,'invalid report ordering must be rejected');
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
    const beforeAssignment=await call('/dashboard/summary',{cookie:operator});
    assert.equal(beforeAssignment.status,200);
    assert.ok(!beforeAssignment.data.attention.priorityCases.some(c=>c.id===caseId),'unassigned case must not appear in operator queue');
    const op = await User.findOne({role:'operator'});
    r = await call(`/cases/${caseId}/assign`,{method:'POST',cookie:admin,body:{operatorId:String(op._id)}});
    assert.equal(r.status,200);
    r = await call(`/cases/${caseId}`,{cookie:operator});
    assert.equal(r.status,200,'assigned operator must see assigned case');
    await t.test('internal follow-ups are scoped, revision guarded and audited',async()=>{
      const path='/cases/'+caseId+'/follow-up';
      const payload={dueDate:'2099-01-01',note:'Fictional internal task',revision:null};
      assert.equal((await call(path,{method:'POST',cookie:a,body:payload})).status,403);
      assert.equal((await call(path,{method:'POST',cookie:b,body:payload})).status,404);
      assert.equal((await call('/follow-ups',{cookie:a})).status,403);
      const created=await call(path,{method:'POST',cookie:operator,body:payload});
      assert.equal(created.status,200,JSON.stringify(created.data));
      assert.equal((await call(path,{method:'POST',cookie:operator,body:payload})).status,409);
      const summary=await call('/dashboard/summary',{cookie:operator});
      assert.ok(summary.data.tasks.scheduled>=1);
      assert.equal((await call('/dashboard/summary',{cookie:a})).data.tasks,undefined);
      const queue=await call('/follow-ups',{cookie:operator});
      assert.ok(queue.data.items.some(x=>x.id===caseId&&x.note===payload.note));
      const creditorView=await call('/cases/'+caseId,{cookie:a});
      assert.ok(!JSON.stringify(creditorView.data).includes(payload.note));
      const original=Activity.create;
      try{
        Activity.create=async()=>{throw new Error('injected follow-up audit failure');};
        assert.equal((await call(path+'/complete',{method:'POST',cookie:operator,body:{revision:created.data.followUp.revision,outcome:'Test completion'}})).status,500);
      }finally{Activity.create=original;}
      assert.equal((await call(path,{cookie:operator})).data.followUp.revision,created.data.followUp.revision);
      assert.equal((await call(path+'/complete',{method:'POST',cookie:operator,body:{revision:created.data.followUp.revision,outcome:'Fictional outcome'}})).status,200);
      assert.equal((await call(path,{cookie:operator})).data.followUp,null);
    });
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
    r = await call(`/cases/${closeId}/activity`,{method:'POST',cookie:admin,body:{text:'Invalid note after closure',visibility:'internal'}});
    assert.equal(r.status,409,'a closed case must not accept new notes');
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
    await t.test('administrator control room is restricted and matches pending ledger',async()=>{
      for(const cookie of [a,b,operator]){
        assert.equal((await call('/operations/control',{cookie})).status,403);
        assert.equal((await call('/operations/health',{cookie})).status,403);
      }
      assert.equal((await call('/operations/control')).status,401);
      const result=await call('/operations/control',{cookie:admin});
      assert.equal(result.status,200,JSON.stringify(result.data));
      assert.equal(result.data.pending.count,1);
      assert.equal(result.data.pending.amountPaise,200_000);
      assert.equal(String(result.data.pending.items[0].caseId),caseId);
      assert.ok(result.data.workload.some(x=>x.id===String(op._id)&&x.active>=1));
      const health=await call('/operations/health',{cookie:admin});
      assert.equal(health.status,200);
      assert.ok(health.data.sampleCount>0&&health.data.sampleCount<=2048);
      assert.ok(!JSON.stringify(health.data).includes('creditora@test'));
    });
    await t.test('explicit receipt retries use durable reference and never duplicate the audit',async()=>{
      const path='/cases/'+caseId+'/receipts';
      const payload={amountPaise:200_000,reference:'DEMO-UTR-1',retrySafe:true};
      const replay=await call(path,{method:'POST',cookie:admin,body:payload});
      assert.equal(replay.status,200);
      assert.equal(replay.data.id,receiptId);
      assert.equal(replay.data.replayed,true);
      assert.equal((await call(path,{method:'POST',cookie:admin,body:{...payload,amountPaise:100}})).status,409);
      assert.equal((await call(path,{method:'POST',cookie:operator,body:payload})).status,403);
      assert.equal(await Receipt.countDocuments({caseId,reference:payload.reference}),1);
      assert.equal(await Activity.countDocuments({caseId,kind:'receipt','metadata.receiptId':receiptId}),1);
    });
    await t.test('audit failure aborts receipt recording and verification atomically',async()=>{
      const originalCreate=Activity.create;
      const baseline=await Receipt.countDocuments({caseId});
      try{
        Activity.create=async()=>{throw new Error('injected audit failure');};
        const record=await call(`/cases/${caseId}/receipts`,{method:'POST',cookie:admin,body:{amountPaise:100,reference:'FAIL-AUDIT'}});
        assert.equal(record.status,500);
        assert.equal(await Receipt.countDocuments({caseId}),baseline);
        const verify=await call(`/cases/${caseId}/receipts/${receiptId}/verify`,{method:'POST',cookie:admin});
        assert.equal(verify.status,500);
        assert.equal((await Receipt.findById(receiptId)).status,'recorded');
        const hold=await call(`/cases/${caseId}/status`,{method:'POST',cookie:admin,body:{action:'hold',reason:'Failure injection'}});
        assert.equal(hold.status,500);
        assert.equal((await Case.findById(caseId)).status,'in_progress');
        const note=await call(`/cases/${caseId}/activity`,{method:'POST',cookie:operator,body:{text:'Injected note',visibility:'internal'}});
        assert.equal(note.status,500);
      }finally{Activity.create=originalCreate;}
      assert.equal((await call(`/cases/${caseId}/reconciliation`,{cookie:a})).status,403);
      assert.equal((await call(`/cases/${caseId}/reconciliation`,{cookie:b})).status,404);
      assert.equal((await call(`/cases/${caseId}/reconciliation`,{cookie:operator})).status,403);
      const report=await call(`/cases/${caseId}/reconciliation`,{cookie:admin});
      assert.equal(report.status,200);
      assert.equal(report.data.requiresReview,false,JSON.stringify(report.data));
      assert.equal(report.data.pendingPaise,200_000);
    });
    // Maker/checker can be enabled for teams with multiple admins; the
    // existing single-admin sample mode is deliberately unchanged by default.
    const previousMakerChecker=process.env.SEPARATE_RECEIPT_APPROVAL;
    process.env.SEPARATE_RECEIPT_APPROVAL='true';
    try{
      const policyView=await call(`/cases/${caseId}`,{cookie:admin});
      assert.equal(policyView.data.approvalPolicy.separateReceiptApproval,true);
      const selfReceipt=policyView.data.receipts.find(v=>v.id===receiptId);
      assert.ok(selfReceipt?.recordedBy,'administrator must see the recorder when dual approval is active');
      const denied=await call(`/cases/${caseId}/receipts/${receiptId}/verify`,{method:'POST',cookie:admin});
      assert.equal(denied.status,403,'strict approval must reject self-verification');
      assert.match(denied.data.error,/different administrator/i);
    }finally{
      if(previousMakerChecker===undefined)delete process.env.SEPARATE_RECEIPT_APPROVAL;
      else process.env.SEPARATE_RECEIPT_APPROVAL=previousMakerChecker;
    }
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
    assert.equal(r.data.receipts[0].recordedBy,null,'creditors must not receive staff recorder IDs');
    await t.test('recovery reporting uses verified movements, date ranges and current permissions',async()=>{
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const path='/reports/recoveries?from='+day+'&to='+day;
      assert.equal((await call(path)).status,401);
      for(const cookie of [a,operator,admin]){
        const result=await call(path,{cookie});
        assert.equal(result.status,200,JSON.stringify(result.data));
        assert.equal(result.data.totals.grossPaise,200_000);
        assert.equal(result.data.totals.reversedPaise,0);
      }
      assert.equal((await call(path,{cookie:b})).data.totals.netPaise,0);
      assert.equal((await call('/reports/recoveries?from=2020-01-01&to=2026-01-01',{cookie:a})).status,422);
    });
    await t.test('aging dashboard reconciles verified amounts and enforces current role scope',async()=>{
      assert.equal((await call('/dashboard/summary')).status,401);
      for(const cookie of [a,admin,operator]){
        const result=await call('/dashboard/summary',{cookie});
        assert.equal(result.status,200,JSON.stringify(result.data));
        const attention=result.data.attention;
        const priority=attention.priorityCases.find(c=>c.id===caseId);
        assert.ok(priority,'accessible active case must appear in attention queue');
        assert.equal(priority.outstandingPaise,800_000);
        assert.ok(priority.overdueDays>0);
        assert.equal(attention.aging.reduce((sum,b)=>sum+b.count,0),attention.overdueCount);
        assert.equal(attention.aging.reduce((sum,b)=>sum+b.outstandingPaise,0),attention.overdueOutstandingPaise);
        assert.ok(!attention.priorityCases.some(c=>c.id===closeId),'closed case must not appear in active attention');
      }
      const other=await call('/dashboard/summary',{cookie:b});
      assert.equal(other.status,200);
      assert.equal(other.data.attention.overdueCount,0);
      assert.ok(!JSON.stringify(other.data).includes(caseId),'tenant B must not receive tenant A case data');
      const audit=await Activity.findOne({caseId,kind:'verified'}).lean();
      assert.equal(audit.metadata.receiptId,receiptId);
      assert.equal(audit.metadata.amountPaise,200_000);
    });
    await t.test('reversal rolls back when its audit cannot be written',async()=>{
      const original=Activity.create;
      try{
        Activity.create=async()=>{throw new Error('injected reversal audit failure');};
        const failed=await call(`/cases/${caseId}/receipts/${receiptId}/reverse`,{method:'POST',cookie:admin,body:{reason:'Injected failure'}});
        assert.equal(failed.status,500);
        assert.equal(await Receipt.countDocuments({reversedFrom:receiptId}),0);
        assert.equal((await call(`/cases/${caseId}`,{cookie:a})).data.financials.recoveredPaise,200_000);
      }finally{Activity.create=original;}
    });
    r = await call(`/cases/${caseId}/receipts/${receiptId}/reverse`,{method:'POST',cookie:admin,body:{reason:'Fictional receipt correction'}});
    assert.equal(r.status,200);
    r = await call(`/cases/${caseId}/receipts/${receiptId}/reverse`,{method:'POST',cookie:admin,body:{reason:'Duplicate correction'}});
    assert.equal(r.status,409,'a verified receipt cannot be reversed twice');
    r = await call(`/cases/${caseId}`,{cookie:a});
    assert.equal(r.data.financials.recoveredPaise,0,'reversal must adjust verified recovery');
    assert.equal(r.data.financials.feePaise,0,'reversal must adjust fee');
    const reconciliation=await call(`/cases/${caseId}/reconciliation`,{cookie:admin});
    assert.equal(reconciliation.status,200);
    assert.equal(reconciliation.data.requiresReview,false,JSON.stringify(reconciliation.data));
    const foreignReceipt=await Receipt.create({caseId,organizationId:orgB._id,amountPaise:100,reference:'MISMATCH',kind:'receipt',status:'verified',recordedBy:(await User.findOne({role:'admin'}))._id});
    try{
      const scoped=await call(`/cases/${caseId}`,{cookie:a});
      assert.equal(scoped.data.financials.recoveredPaise,0);
      assert.ok(!scoped.data.receipts.some(r=>r.id===String(foreignReceipt._id)));
      const dashboard=await call('/dashboard/summary',{cookie:a});
      assert.equal(dashboard.status,200);
      assert.equal(dashboard.data.attention.priorityCases.find(c=>c.id===caseId)?.outstandingPaise,1_000_000,'dashboard must exclude tenant-mismatched receipt');
      const issue=await call(`/cases/${caseId}/reconciliation`,{cookie:admin});
      assert.ok(issue.data.issues.some(i=>i.code==='receipt_tenant_mismatch'));
    }finally{await Receipt.deleteOne({_id:foreignReceipt._id});}
    const reportDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const movement=await call('/reports/recoveries?from='+reportDay+'&to='+reportDay,{cookie:a});
    assert.equal(movement.status,200);
    assert.equal(movement.data.totals.grossPaise,200_000);
    assert.equal(movement.data.totals.reversedPaise,200_000);
    assert.equal(movement.data.totals.netPaise,0);
    const reversedDashboard=await call('/dashboard/summary',{cookie:a});
    assert.equal(reversedDashboard.status,200);
    assert.equal(reversedDashboard.data.attention.priorityCases.find(c=>c.id===caseId)?.outstandingPaise,1_000_000,'aging balances must include reversals');
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
    await t.test('bounded synthetic portfolio benchmark and concurrent tenant isolation',async t=>{
      // This suite already restricts TEST_MONGODB_URI to the disposable test DB.
      const userA=await User.findOne({email:'creditora@test.collectdesk.local'});
      const userB=await User.findOne({email:'creditorb@test.collectdesk.local'});
      const owner=await User.findOne({email:'operator@test.collectdesk.local'});
      const maker=await User.findOne({email:'admin@test.collectdesk.local'});
      const seed=(user,prefix)=>Array.from({length:300},(_,i)=>({
        caseCode:'PERF-'+prefix+'-'+i,organizationId:user.organizationId,createdBy:user._id,
        debtorName:'Synthetic '+prefix+' '+i,invoiceNo:'PERF-'+prefix+'-'+i,
        issueDate:new Date('2025-01-01'),dueDate:new Date('2025-02-01'),
        principalPaise:100000,status:'in_progress',assignedTo:owner._id
      }));
      const inserted=await Case.insertMany([...seed(userA,'A'),...seed(userB,'B')]);
      const ids=inserted.map(c=>c._id);
      try{
        await Receipt.insertMany(inserted.map(c=>({caseId:c._id,organizationId:c.organizationId,
          amountPaise:1000,reference:'PERF-'+c.caseCode,status:'verified',kind:'receipt',
          recordedBy:maker._id,verifiedBy:maker._id,verifiedAt:new Date()})));
        const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const routes=['/cases?q=PERF-&limit=25','/dashboard/summary','/reports/recoveries?from='+date+'&to='+date,'/notifications/count'];
        const results=[];
        // Eight concurrent clients, 64 requests total, two independent tenant sessions.
        await Promise.all(Array.from({length:8},async(_,worker)=>{
          const tenant=worker%2?'B':'A',cookie=worker%2?b:a;
          for(let i=0;i<8;i++){
            const path=routes[i%routes.length],start=performance.now();
            const r=await call(path,{cookie});
            results.push({path,ms:performance.now()-start});
            assert.equal(r.status,200,JSON.stringify(r.data));
            if(path.startsWith('/cases?')){
              assert.equal(r.data.pagination.total,300);
              assert.ok(r.data.cases.every(c=>c.caseCode.startsWith('PERF-'+tenant+'-')));
            }
            if(path.startsWith('/reports/'))assert.ok(r.data.totals.grossPaise>=300000);
          }
        }));
        const durations=results.map(r=>r.ms).sort((a,b)=>a-b);
        const p95=durations[Math.ceil(durations.length*.95)-1];
        t.diagnostic('PERF synthetic 600 cases / 600 receipts, 8 concurrent clients, '+durations.length+' reads; p50='+durations[Math.ceil(durations.length*.5)-1].toFixed(1)+'ms p95='+p95.toFixed(1)+'ms max='+durations.at(-1).toFixed(1)+'ms');
        assert.ok(p95<5000,'Synthetic local CI read p95 exceeded broad 5-second regression budget');
      }finally{
        await Receipt.deleteMany({caseId:{$in:ids}});
        await Case.deleteMany({_id:{$in:ids}});
      }
    });
    await t.test('logout sends a clearing cookie', async()=>{
      const logout=await call('/auth/logout',{method:'POST',cookie:a});
      assert.equal(logout.status,200);
      assert.match(logout.cookie||'',/collectdesk_session=/);
      assert.equal((await call('/auth/me',{cookie:a})).status,401,'logged-out token cannot be replayed');
      const newSession=await signIn('creditora@test.collectdesk.local');
      assert.equal((await call('/auth/me',{cookie:newSession})).status,200,'a fresh session remains valid');
    });
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    await mongoose.disconnect();
  }
});
