/**
 * Opt-in API integration suite. Runs against a dedicated disposable MongoDB database.
 * In local/offline runs without TEST_MONGODB_URI, it is explicitly SKIPPED.
 * CI starts MongoDB and sets TEST_MONGODB_URI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,createHash,sign} from 'node:crypto';

const uri = process.env.TEST_MONGODB_URI;

test('end-to-end API workflow and authorization (MongoDB required)', {skip: !uri && 'Set TEST_MONGODB_URI to a dedicated test database'}, async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  process.env.JWT_SECRET = 'integration-test-only-secret-replace-for-real-production';
  const mongoose = (await import('mongoose')).default;
  const bcrypt = (await import('bcryptjs')).default;
  const {Organization, OrganizationEvent, StaffAccessEvent, User, Case, Activity, Receipt, CaseDocument, DocumentEvent} = await import('../src/models.js');

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
    const {assertLedgerReady}=await import('../src/financial-write.js');
    await assertLedgerReady();
    await Promise.all([CaseDocument.init(),DocumentEvent.init()]);

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
    async function call(path, {method='GET', cookie, body, origin='http://localhost:3000', headers={}}={}) {
      headers={...headers};
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
    await t.test('readiness has a bounded deadline and coalesces concurrent pings',async()=>{
      const database=mongoose.connection.db;
      const originalCommand=database.command;
      let attempts=0;
      database.command=function(command,options){
        if(command.ping!==1)return originalCommand.call(this,command,options);
        attempts++;
        return new Promise((resolve,reject)=>{
          options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
        });
      };
      try{
        const started=performance.now();
        const responses=await Promise.all(
          ['/health','/readiness'].map(path=>fetch(base+path,{signal:AbortSignal.timeout(5000)}))
        );
        assert.deepEqual(responses.map(response=>response.status),[503,503]);
        assert.equal(attempts,1);
        assert.ok(performance.now()-started<4000,'HTTP readiness must have its own deadline');
      }finally{
        database.command=originalCommand;
      }
      assert.equal((await fetch(base+'/readiness')).status,200);
    });
    await t.test('organization privileges, delivery, activation and revocation',async()=>{
      const aUser=await User.findOne({organizationId:orgA._id});
      await User.updateOne({_id:aUser._id},{$set:{organizationRole:'owner'}});
      assert.equal((await call('/organization',{cookie:a})).data.owner,true);
      assert.equal((await call('/organization',{cookie:b})).data.owner,false);
      assert.equal((await call('/organization',{cookie:operator})).status,403);
      assert.equal((await call('/organizations',{cookie:b})).status,403);
      assert.equal((await call('/organizations',{cookie:admin})).data.organizations.length,2);
      const patch=(cookie,body)=>call('/organization',{method:'PATCH',cookie,body});
      assert.equal((await patch(b,{name:'Unauthorized rename'})).status,403);
      assert.equal((await patch(a,{name:'Fictional updated company',organizationId:String(orgB._id)})).status,422);
      assert.equal((await patch(a,{name:'Fictional updated company'})).status,200);
      assert.equal(await OrganizationEvent.countDocuments({organizationId:orgA._id,
        kind:'organization_renamed'}),1,'company edits must leave an owner-visible audit entry');
      if(process.env.LEDGER_TRANSACTIONS_REQUIRED==='true'){
        const originalSave=OrganizationEvent.prototype.save;
        OrganizationEvent.prototype.save=function(...args){
          if(this.kind==='organization_renamed')throw new Error('Injected organization audit failure');
          return originalSave.apply(this,args);
        };
        try{
          assert.equal((await patch(a,{name:'Unaudited company rename'})).status,500);
        }finally{OrganizationEvent.prototype.save=originalSave;}
        assert.equal((await Organization.findById(orgA._id).lean()).name,'Fictional updated company',
          'failed audit write must roll back company rename');
      }
      const path='/organization/invitations';
      const invitation={email:'invited-member@example.test'};
      const send=(cookie,body=invitation)=>call(path,{method:'POST',cookie,body});
      assert.equal((await send(b)).status,403);
      if(process.env.LEDGER_TRANSACTIONS_REQUIRED!=='true'){
        assert.equal((await send(a)).status,503);
        return;
      }
      const savedEnv={BREVO_API_KEY:process.env.BREVO_API_KEY,BREVO_FROM_EMAIL:process.env.BREVO_FROM_EMAIL};
      const previousFetch=globalThis.fetch;
      const sent=[];
      process.env.BREVO_API_KEY='fixture-only';
      process.env.BREVO_FROM_EMAIL='qa@example.test';
      globalThis.fetch=(url,options)=>{
        if(String(url)==='https://api.brevo.com/v3/smtp/email'){
          sent.push(JSON.parse(options.body).textContent);
          return Promise.resolve(new Response('{}',{status:201}));
        }
        return previousFetch(url,options);
      };
      try{
        const sends=await Promise.all([send(a),send(a)]);
        assert.deepEqual(sends.map(result=>result.status).sort(),[201,409]);
        const invited=sends.find(result=>result.status===201);
        assert.equal(sent.length,1);
        assert.equal(JSON.stringify(invited.data).includes('token'),false);
        const token=sent[0].match(/#token=([A-Za-z0-9_-]{43})/)[1];
        const accept=body=>call('/auth/organization-invite/accept',{method:'POST',body});
        const details={token,name:'Fictional teammate',password:'Test-Only-Password-2026!'};
        const attempts=await Promise.all([accept(details),accept(details)]);
        assert.deepEqual(attempts.map(result=>result.status).sort(),[201,400]);
        const joined=attempts.find(result=>result.status===201);
        assert.equal(joined.data.user.organizationId,String(orgA._id));
        assert.equal((await call('/organization',{cookie:joined.cookie})).data.owner,false);
        assert.equal((await call('/cases',{cookie:joined.cookie})).status,200);
        assert.equal((await call(path+'/'+invited.data.invitation.id+'/revoke',{method:'POST',cookie:a})).status,404);
        const second=await send(a,{email:'revoked-member@example.test'});
        assert.equal(second.status,201);
        const revoke=path+'/'+second.data.invitation.id+'/revoke';
        assert.equal((await call(revoke,{method:'POST',cookie:a})).status,200);
        assert.equal(await OrganizationEvent.countDocuments({organizationId:orgA._id,
          kind:'invitation_revoked'}),1,'invitation revocation must be audited');
        assert.equal((await call(revoke,{method:'POST',cookie:a})).status,404);
        const deactivate='/organization/members/'+joined.data.user.id+'/deactivate';
        assert.equal((await call(deactivate,{method:'POST',cookie:b})).status,403);
        if(process.env.LEDGER_TRANSACTIONS_REQUIRED==='true'){
          const originalSave=OrganizationEvent.prototype.save;
          OrganizationEvent.prototype.save=function(...args){
            if(this.kind==='member_deactivated')throw new Error('Injected member audit failure');
            return originalSave.apply(this,args);
          };
          try{assert.equal((await call(deactivate,{method:'POST',cookie:a})).status,500);}
          finally{OrganizationEvent.prototype.save=originalSave;}
          assert.equal((await User.findById(joined.data.user.id).lean()).active,true,
            'an audit failure must not revoke an account without a record');
          assert.equal((await call('/cases',{cookie:joined.cookie})).status,200,
            'member session must remain valid after rolled-back deactivation');
        }
        assert.equal((await call(deactivate,{method:'POST',cookie:a})).status,200);
        assert.equal(await OrganizationEvent.countDocuments({organizationId:orgA._id,
          kind:'member_deactivated'}),1,'member revocations must appear in audit trail');
        assert.equal((await call('/cases',{cookie:joined.cookie})).status,401);
      }finally{
        globalThis.fetch=previousFetch;
        for(const [key,value] of Object.entries(savedEnv)){
          if(value===undefined)delete process.env[key];else process.env[key]=value;
        }
      }
    });
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
      const notices=(await call('/notifications',{cookie:a})).data.operations;
      assert.equal(notices.some(notice=>notice.kind==='support'&&notice.status==='resolved'),true);
      assert.equal((await call('/notifications',{cookie:b})).data.operations.length,0);

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
    await t.test('private documents enforce scanning, encryption, tenant access and expiry',async()=>{
      const {Readable}=await import('node:stream');
      const {purgeExpiredDocuments}=await import('../src/private-documents.js');
      const folder=await Case.create({
        caseCode:'CC-PRIVATE-DOC',organizationId:orgA._id,createdBy:(await User.findOne({organizationId:orgA._id}))._id,
        debtorName:'Private fixture',invoiceNo:'PRIVATE-FIXTURE',issueDate:new Date('2026-01-01'),
        dueDate:new Date('2026-02-01'),principalPaise:50000,status:'draft'
      });
      const bytes=Buffer.from('%PDF-1.4\nFictional invoice\n%%EOF\n');
      const blobs=new Map();
      let verdict=true;
      const provider={config:{bucket:'test-fixture',retentionDays:3},scan:async()=>verdict,storage:{
        async send(command){
          const {Key,Body,ServerSideEncryption}=command.input;
          switch(command.constructor.name){
            case 'PutObjectCommand': assert.equal(ServerSideEncryption,'AES256');blobs.set(Key,Buffer.from(Body));return {};
            case 'GetObjectCommand': {const blob=blobs.get(Key);return {ContentLength:blob.length,Body:Readable.from(blob)};}
            case 'DeleteObjectCommand': blobs.delete(Key);return {};
            default: throw new Error('Unexpected storage operation');
          }
        }
      }};
      app.locals.documentService=()=>provider;
      const path='/cases/'+folder._id+'/documents';
      const upload=(cookie,body=bytes)=>fetch(base+'/api/v1'+path,{method:'POST',headers:{
        cookie,origin:'http://localhost:3000','content-type':'application/pdf','x-document-category':'invoice',
        'x-file-name':'fictional.pdf'
      },body});
      try{
        assert.equal((await upload(b)).status,404);
        assert.equal((await upload(a,Buffer.from('invalid'))).status,422);
        verdict=false;
        assert.equal((await upload(a)).status,422);
        assert.equal(blobs.size,0,'rejected bytes must not reach object storage');
        assert.equal(await CaseDocument.countDocuments({caseId:folder._id}),0,
          'rejected scanning must immediately release private document quota');
        assert.equal(await DocumentEvent.countDocuments({caseId:folder._id,kind:'scan_rejected'}),1,
          'rejected file scans must leave an audit event');
        verdict=true;
        const result=await upload(a);
        assert.equal(result.status,201);
        const {document}=await result.json();
        assert.equal(document.status,'clean');
        assert.equal(document.objectKey,undefined);
        assert.equal(await DocumentEvent.countDocuments({caseId:folder._id,kind:'uploaded'}),1,
          'published documents must have a durable upload audit event');
        const download=await fetch(base+'/api/v1'+path+'/'+document.id,{headers:{cookie:a}});
        assert.equal(download.status,200);
        assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
        assert.equal((await call(path+'/'+document.id,{cookie:b})).status,404);
        assert.equal(await DocumentEvent.countDocuments({caseId:folder._id,kind:'download_authorized'}),1);
        await CaseDocument.updateMany({caseId:folder._id},{$set:{expiresAt:new Date(0)}});
        assert.equal((await call(path+'/'+document.id,{cookie:a})).status,404);
        assert.equal(await purgeExpiredDocuments(provider),1);
        assert.equal(blobs.size,0);
      }finally{
        delete app.locals.documentService;
        await CaseDocument.deleteMany({caseId:folder._id});
        await DocumentEvent.deleteMany({caseId:folder._id});
        await Case.deleteOne({_id:folder._id});
      }
    });
    await t.test('case lifecycle and audit entries commit atomically in transaction mode',
      {skip:process.env.LEDGER_TRANSACTIONS_REQUIRED!=='true'},async()=>{
      const initial={...invoice,invoiceNo:'TX-CASE-AUDIT-001',description:'Original fictional draft'};
      const originalSave=Activity.prototype.save;
      async function failAudit(kind,request){
        Activity.prototype.save=function(...args){
          if(this.kind===kind)throw new Error('Injected '+kind+' audit failure');
          return originalSave.apply(this,args);
        };
        try{return await request();}
        finally{Activity.prototype.save=originalSave;}
      }
      const create=()=>call('/cases',{method:'POST',cookie:a,body:initial});
      assert.equal((await failAudit('created',create)).status,500);
      assert.equal(await Case.countDocuments({invoiceNo:initial.invoiceNo}),0,
        'a failed creation audit must roll back the case itself');
      const saved=await create();
      assert.equal(saved.status,201);
      const draftId=saved.data.id;
      const update={...initial,description:'Changed without audit'};
      assert.equal((await failAudit('updated',()=>call('/cases/'+draftId,{
        method:'PATCH',cookie:a,body:update
      }))).status,500);
      assert.equal((await Case.findById(draftId).lean()).description,initial.description,
        'a failed draft-edit audit must roll back the edited fields');
      assert.equal((await failAudit('submitted',()=>call('/cases/'+draftId+'/submit',{
        method:'POST',cookie:a
      }))).status,500);
      assert.equal((await Case.findById(draftId).lean()).status,'draft',
        'failed submission audit must not submit a draft');
      assert.equal((await call('/cases/'+draftId+'/submit',{method:'POST',cookie:a})).status,200);
      const review=()=>call('/cases/'+draftId+'/review',{method:'POST',cookie:admin,
        body:{decision:'accept',reason:'Valid fictional invoice'}});
      assert.equal((await failAudit('review',review)).status,500);
      assert.equal((await Case.findById(draftId).lean()).status,'submitted',
        'failed review audit must leave the case awaiting review');
      assert.equal((await review()).status,200);
      const operatorAccount=await User.findOne({role:'operator',active:true}).lean();
      assert.ok(operatorAccount,'operator fixture must exist');
      const assign=()=>call('/cases/'+draftId+'/assign',{method:'POST',cookie:admin,
        body:{operatorId:String(operatorAccount._id)}});
      assert.equal((await failAudit('assigned',assign)).status,500);
      const afterAssign=await Case.findById(draftId).lean();
      assert.equal(afterAssign.status,'accepted');
      assert.equal(afterAssign.assignedTo??null,null,
        'failed assignment audit must not assign an operator');
      assert.equal((await assign()).status,200);
      const note='This note must not survive an aborted case transaction';
      assert.equal((await failAudit('note',()=>call('/cases/'+draftId+'/activity',{
        method:'POST',cookie:operator,body:{text:note,visibility:'internal'}
      }))).status,500);
      assert.equal(await Activity.countDocuments({caseId:draftId,kind:'note',text:note}),0,
        'failed note audit must not persist a partial activity event');
      // The outer workflow asserts case counts and exact pagination. Clean up
      // this isolated rollback fixture rather than changing those baselines.
      await Activity.deleteMany({caseId:draftId});
      await Case.deleteOne({_id:draftId});
    });

    // A creditor can edit their own draft, but never an accepted/submitted claim.
    const editableInvoice={...invoice,description:'Corrected draft description'};
    r = await call(`/cases/${caseId}`,{method:'PATCH',cookie:a,body:editableInvoice});
    assert.equal(r.status,200,'creditor should be able to edit its own draft');
    const staleDraft=await call(`/cases/${caseId}`,{method:'PATCH',cookie:a,body:{...editableInvoice,
      expectedUpdatedAt:'2025-01-01T00:00:00.000Z',description:'Stale edit should not replace this draft'}});
    assert.equal(staleDraft.status,409);

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
    r = await call(`/cases/${closeId}/activity`,{method:'POST',cookie:admin,body:{text:'Invalid note after closure',visibility:'internal'}});
    assert.equal(r.status,409,'a closed case must not accept new notes');
    r = await call(`/cases/${caseId}/activity`,{method:'POST',cookie:operator,body:{text:'Internal review, not for creditor',visibility:'internal'}});
    assert.equal(r.status,201);
    r = await call(`/cases/${caseId}/activity`,{method:'POST',cookie:operator,body:{text:'Progress update for the creditor',visibility:'creditor'}});
    assert.equal(r.status,201);
    r = await call(`/cases/${caseId}`,{cookie:a});
    assert.ok(r.data.activities.some(e=>e.text==='Progress update for the creditor'));
    assert.ok(!r.data.activities.some(e=>e.text.includes('Internal review')),'internal updates must remain hidden');

    await t.test('assigned work-plan visibility and priority authorization',async()=>{
      const path='/cases/'+caseId+'/work-plan';
      const plan={followUpAt:new Date(Date.now()+86_400_000).toISOString(),followUpNote:'Internal fictional follow-up'};
      const update=(cookie,body)=>call(path,{method:'POST',cookie,body});
      assert.equal((await update(a,plan)).status,403);
      assert.equal((await update(operator,{...plan,priority:'urgent'})).status,403);
      assert.equal((await update(admin,{...plan,priority:'high'})).status,200);
      assert.equal((await update(operator,plan)).status,200);
      const queue=(await call('/work-queue',{cookie:operator})).data;
      assert.equal(queue.items.find(item=>item.id===caseId).priority,'high');
      assert.equal((await call('/cases/'+caseId,{cookie:a})).data.workPlan,undefined);
      assert.equal((await call('/work-queue?view=unassigned',{cookie:operator})).status,403);
      await Case.updateOne({_id:caseId},{$set:{followUpAt:new Date(Date.now()-1000)}});
      const reminders=(await call('/notifications?unread=1',{cookie:operator})).data.operations;
      assert.ok(reminders.some(item=>item.kind==='follow_up'&&item.href==='/cases/'+caseId));
      assert.equal((await call('/notifications',{cookie:a})).data.operations.some(item=>item.kind==='follow_up'),false);

    });
    await t.test('inactive operators cannot strand cases outside the admin handoff queue',async()=>{
      const creditor=await User.findOne({email:'creditora@test.collectdesk.local'}).lean();
      const activeOperator=await User.findOne({email:'operator@test.collectdesk.local'}).lean();
      const inactive=await User.create({
        name:'Handoff test operator',email:'handoff-operator@collectdesk-ci.test',
        role:'operator',passwordHash
      });
      const stranded=await Case.create({
        caseCode:'CC-STAFF-HANDOFF-001',organizationId:orgA._id,createdBy:creditor._id,
        debtorName:'Synthetic reassignment case',invoiceNo:'STAFF-HANDOFF-001',
        issueDate:new Date('2026-01-01'),dueDate:new Date('2026-02-01'),
        principalPaise:75000,status:'in_progress',assignedTo:inactive._id
      });
      const view=()=>call('/work-queue?view=unassigned',{cookie:admin});
      try{
        assert.equal((await view()).data.items.some(item=>item.id===String(stranded._id)),false,
          'cases with active operators must not appear in the handoff queue');
        const disabled=await call('/staff/operators/'+inactive._id+'/access',{
          method:'POST',cookie:admin,body:{active:false}
        });
        assert.equal(disabled.status,200);
        const queue=await view();
        assert.equal(queue.status,200);
        const item=queue.data.items.find(item=>item.id===String(stranded._id));
        assert.ok(item,'admin handoff queue must include cases assigned to inactive operators');
        assert.equal(item.assignmentState,'inactive_operator');
        assert.equal((await call('/work-queue?view=unassigned',{cookie:operator})).status,403,
          'operator cannot see the admin reassignment queue');
        const assigned=await call('/cases/'+stranded._id+'/assign',{
          method:'POST',cookie:admin,body:{operatorId:String(activeOperator._id)}
        });
        assert.equal(assigned.status,200,'admin must be able to hand off a stranded case');
        assert.equal((await view()).data.items.some(row=>row.id===String(stranded._id)),false,
          'reassigned cases must disappear from the handoff queue');
      }finally{
        await Activity.deleteMany({caseId:stranded._id});
        await Case.deleteOne({_id:stranded._id});
        await StaffAccessEvent.deleteMany({operatorId:inactive._id});
        await User.deleteOne({_id:inactive._id});
      }
    });
    await t.test('financial records roll back with audit failure and retry safely',{skip:process.env.LEDGER_TRANSACTIONS_REQUIRED!=='true'},async()=>{
      const path='/cases/'+caseId+'/receipts';
      const key=randomUUID();
      const payment={amountPaise:200,reference:'TX-ROLLBACK-001'};
      const post=(body)=>call(path,{method:'POST',cookie:admin,body,headers:{'Idempotency-Key':key}});
      const save=Activity.prototype.save;
      Activity.prototype.save=function(...args){
        if(this.kind==='receipt')throw new Error('Fixture audit write failed');
        return save.apply(this,args);
      };
      try{
        assert.equal((await post(payment)).status,500);
        assert.equal(await Receipt.countDocuments({caseId,reference:payment.reference}),0);
      }finally{Activity.prototype.save=save;}
      const [first,replay]=await Promise.all([post(payment),post(payment)]);
      assert.equal(first.status,201);
      assert.deepEqual(first.data,replay.data);
      assert.equal(await Receipt.countDocuments({caseId,reference:payment.reference}),1);
      assert.equal(await Activity.countDocuments({'metadata.receiptId':new mongoose.Types.ObjectId(first.data.id)}),1);
      assert.equal((await post({...payment,amountPaise:300})).status,409);
      const reversalPath='/cases/'+caseId+'/receipts/'+first.data.id;
      const verify=await call(reversalPath+'/verify',{method:'POST',cookie:admin});
      assert.equal(verify.status,200);
      Activity.prototype.save=function(...args){
        if(this.kind==='reversal')throw new Error('Fixture reversal audit write failed');
        return save.apply(this,args);
      };
      try{
        assert.equal((await call(reversalPath+'/reverse',{method:'POST',cookie:admin,body:{reason:'Test rollback'}})).status,500);
        assert.equal(await Receipt.countDocuments({reversedFrom:first.data.id}),0);
      }finally{Activity.prototype.save=save;}
      await Receipt.deleteOne({_id:first.data.id});
    });
    r = await call(`/cases/${caseId}/receipts`,{method:'POST',cookie:operator,body:{amountPaise:200_000,reference:'DEMO-UTR-1'}});
    assert.equal(r.status,403,'operator must not record receipts');
    r = await call(`/cases/${caseId}/receipts`,{method:'POST',cookie:admin,body:{amountPaise:200_000,reference:'DEMO-UTR-1'}});
    assert.equal(r.status,201,JSON.stringify(r.data));
    const receiptId = r.data.id;
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
    r = await call(`/cases/${caseId}/receipts/${receiptId}/reverse`,{method:'POST',cookie:admin,body:{reason:'Fictional receipt correction'}});
    assert.equal(r.status,200);
    r = await call(`/cases/${caseId}/receipts/${receiptId}/reverse`,{method:'POST',cookie:admin,body:{reason:'Duplicate correction'}});
    assert.equal(r.status,409,'a verified receipt cannot be reversed twice');
    r = await call(`/cases/${caseId}`,{cookie:a});
    assert.equal(r.data.financials.recoveredPaise,0,'reversal must adjust verified recovery');
    assert.equal(r.data.financials.feePaise,0,'reversal must adjust fee');
    const exportUrl=base+'/api/v1/cases/'+caseId+'/reconciliation.csv';
    for(const cookie of [a,operator]){
      assert.equal((await fetch(exportUrl,{headers:{cookie}})).status,403);
    }
    const ledger=await fetch(exportUrl,{headers:{cookie:admin}});
    assert.equal(ledger.status,200);
    assert.match(await ledger.text(),/"reversal","verified",200000,-200000/);

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
        const {PasswordReset}=await import('../src/models.js');
        await PasswordReset.updateOne({tokenHash:createHash('sha256').update(resetLink[1]).digest('hex')},
          {$set:{expiresAt:new Date(0)}});
        assert.equal((await call('/auth/password/reset',{
          method:'POST',body:{token:resetLink[1],password:'NewSecurePassword2026!'}
        })).status,400,'expired recovery links cannot change passwords');
        assert.equal((await call('/auth/password/forgot',{
          method:'POST',body:{email:registration.email}
        })).status,202);
        const token=sent.at(-1).text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)[1];
        assert.equal((await call('/auth/password/reset',{
          method:'POST',body:{token,password:'Password1!'+ '界'.repeat(30)}
        })).status,422,'bcrypt inputs must be at most 72 UTF-8 bytes');
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
        const beforeGoogleCompanies=await Organization.countDocuments();
        if(process.env.LEDGER_TRANSACTIONS_REQUIRED==='true'){
          const originalSave=OrganizationEvent.prototype.save;
          OrganizationEvent.prototype.save=function(...args){
            if(this.kind==='organization_created')throw new Error('Injected onboarding audit failure');
            return originalSave.apply(this,args);
          };
          try{
            result=await call('/auth/organization',{method:'POST',cookie:googleCookie,
              body:{organizationName:'Company that must roll back'}});
            assert.equal(result.status,500,'failed audit must abort Google onboarding');
          }finally{OrganizationEvent.prototype.save=originalSave;}
          assert.equal(await Organization.countDocuments(),beforeGoogleCompanies,
            'failed Google onboarding must not leave an orphan organization');
          const googleAccount=await User.findOne({email:'new-google@collectdesk-ci.test'}).lean();
          assert.equal(googleAccount.organizationId??null,null,
            'failed onboarding must leave the account available to retry');
          assert.equal((await call('/cases',{cookie:googleCookie})).status,403,
            'failed onboarding must not grant access to cases');
        }
        const onboard=body=>call('/auth/organization',{method:'POST',cookie:googleCookie,body});
        const results=process.env.LEDGER_TRANSACTIONS_REQUIRED==='true'
          ? await Promise.all([
              onboard({organizationName:'New Google Fictional Company'}),
              onboard({organizationName:'Competing Google Company'})
            ])
          : [await onboard({organizationName:'New Google Fictional Company'})];
        assert.equal(results.filter(row=>row.status===200).length,1,
          'only one competing organization onboarding may succeed');
        assert.ok(results.every(row=>[200,409].includes(row.status)),
          'competing onboarding must return success or conflict, never an internal error');
        assert.equal(await Organization.countDocuments(),beforeGoogleCompanies+1,
          'competing Google onboarding must not produce an extra organization');
        const created=results.find(row=>row.status===200);
        assert.ok(created.data.user.organizationId);
        if(process.env.LEDGER_TRANSACTIONS_REQUIRED==='true'){
          assert.equal(await OrganizationEvent.countDocuments({
            organizationId:created.data.user.organizationId,kind:'organization_created'
          }),1,'new workspace owner must leave an audited creation event');
        }
        result=await call('/cases',{cookie:googleCookie});
        assert.equal(result.status,200);
        assert.equal(result.data.cases.length,0,'Google new company cannot see seeded records');
        result=await onboard({organizationName:'Duplicate organization'});
        assert.equal(result.status,409,'onboarding is one-time only');
      }finally{
        globalThis.fetch=originalFetch;
        for(const [k,v] of Object.entries(originalEnv)){
          if(v===undefined)delete process.env[k];else process.env[k]=v;
        }
      }
    });
    await t.test('workspace digest requires consent and claims each delivery window once',async()=>{
      const {sendWorkspaceDigests}=await import('../src/workspace-digest.js');
      const {DigestDelivery}=await import('../src/models.js');
      const preferences='/auth/notification-preferences';
      const opt=(cookie,emailDigest)=>call(preferences,{method:'PATCH',cookie,body:{emailDigest}});
      assert.equal((await opt(a,true)).status,503);
      const saved={WORKSPACE_DIGEST_ENABLED:process.env.WORKSPACE_DIGEST_ENABLED,
        BREVO_API_KEY:process.env.BREVO_API_KEY,BREVO_FROM_EMAIL:process.env.BREVO_FROM_EMAIL};
      const original=globalThis.fetch;
      const sent=[];
      let providerAvailable=true;
      process.env.WORKSPACE_DIGEST_ENABLED='true';
      process.env.BREVO_API_KEY='fixture-only';
      process.env.BREVO_FROM_EMAIL='qa@example.test';
      globalThis.fetch=(url,options)=>{
        if(String(url)==='https://api.brevo.com/v3/smtp/email'){
          sent.push(JSON.parse(options.body));
          return Promise.resolve(new Response('{}',{status:providerAvailable?201:503}));
        }
        return original(url,options);
      };
      try{
        assert.equal((await opt(undefined,true)).status,401);
        assert.equal((await opt(a,true)).data.emailDigest,true);
        const now=new Date(Date.now()+1000);
        await Activity.create({caseId,organizationId:orgA._id,actorId:recordedBy,kind:'review',
          visibility:'creditor',text:'Private fictional amount excluded from email.',createdAt:now});
        const worker=(time=now)=>sendWorkspaceDigests({origin:'http://localhost:3000',now:time});
        const reports=await Promise.all([worker(),worker()]);
        assert.equal(reports.reduce((sum,report)=>sum+report.sent,0),1);
        assert.equal(sent.length,1);
        assert.equal(sent[0].to[0].email,'creditora@test.collectdesk.local');
        assert.ok(!sent[0].textContent.includes('Private fictional amount'));
        assert.equal((await worker(new Date(now.getTime()+86_400_000))).sent,0);
        assert.equal(await DigestDelivery.countDocuments(),1);
        providerAvailable=false;
        const nextDay=new Date(now.getTime()+86_400_000);
        await Activity.create({caseId,organizationId:orgA._id,actorId:recordedBy,kind:'review',
          visibility:'creditor',text:'Another fictional change.',createdAt:nextDay});
        assert.equal((await worker(nextDay)).unconfirmed,1);
        assert.equal((await worker(nextDay)).unconfirmed,0,'failed deliveries must not be retried automatically');
        assert.equal(sent.length,2);
        assert.equal((await opt(a,false)).data.emailDigest,false);
      }finally{
        globalThis.fetch=original;
        for(const [key,value] of Object.entries(saved)){
          if(value===undefined)delete process.env[key];else process.env[key]=value;
        }
      }
    });
    await t.test('administrator operator access changes revoke sessions and retain audit records',async()=>{
      const staff=await User.findOne({email:'operator@test.collectdesk.local'});
      const path='/staff/operators/'+staff._id+'/access';
      const change=(cookie,active)=>call(path,{method:'POST',cookie,body:{active}});
      const history=()=>call('/staff/operators/access-history',{cookie:admin});
      assert.equal((await change(operator,false)).status,403);
      assert.equal((await call('/staff/operators/access-history',{cookie:a})).status,403);
      assert.equal((await call('/staff/operators/access-history',{cookie:operator})).status,403);
      if(process.env.LEDGER_TRANSACTIONS_REQUIRED==='true'){
        const originalSave=StaffAccessEvent.prototype.save;
        StaffAccessEvent.prototype.save=function(...args){
          if(this.action==='deactivated')throw new Error('Injected access audit failure');
          return originalSave.apply(this,args);
        };
        try{assert.equal((await change(admin,false)).status,500);}
        finally{StaffAccessEvent.prototype.save=originalSave;}
        assert.equal((await User.findById(staff._id).lean()).active,true,
          'audit failure must roll back operator deactivation');
        assert.equal((await call('/auth/me',{cookie:operator})).status,200,
          'operator session must survive a rolled-back access change');
      }
      assert.equal((await change(admin,false)).status,200);
      assert.equal((await call('/auth/me',{cookie:operator})).status,401);
      let result=await history();
      assert.equal(result.status,200);
      assert.equal(result.data.events[0].action,'deactivated');
      assert.equal(result.data.events[0].operator,'Operator');
      assert.equal(result.data.events[0].actor,'Admin');
      assert.equal((await change(admin,true)).status,200);
      assert.equal((await call('/auth/me',{cookie:operator})).status,401);
      result=await history();
      assert.equal(result.data.events[0].action,'restored');
      assert.equal(result.data.events[1].action,'deactivated');
      assert.equal((await change(admin,true)).status,409,
        'repeat restoration must not create a duplicate audit record');
      assert.equal(await StaffAccessEvent.countDocuments({operatorId:staff._id}),2);
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
