/**
 * Regression: client-side workspace navigation must not re-fetch /auth/me or
 * blank the whole workspace every time a Next.js sidebar Link is clicked.
 * Run ONLY against a disposable seeded fictional-data environment.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.AUDIT_BASE_URL || 'http://localhost:3000';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'Use an isolated local fixture.');
const password=process.env.DEMO_SEED_PASSWORD;
if(!password || password.length<12)throw new Error('Set a private DEMO_SEED_PASSWORD for local test fixtures.');

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1366,height:900}});
  const auth=await context.request.post(base+'/api/v1/auth/login',{
    headers:{Origin:base},
    data:{email:'creditor@demo.collectdesk.test',password}
  });
  assert.equal(auth.status(),200,'Fixture creditor login must work');
  const page=await context.newPage();
  let sessionRequests=0;
  page.on('request',request=>{
    if(new URL(request.url()).pathname==='/api/v1/auth/me')sessionRequests++;
  });
  await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});
  await page.locator('.metrics-grid').waitFor({timeout:20000});
  assert.ok(sessionRequests>=1,'Initial workspace visit must verify the session');
  const initialChecks=sessionRequests;

  await page.evaluate(()=>{
    window.__collectDeskNavigationAudit={loadingFlash:false};
    const observer=new MutationObserver(()=>{
      if(document.body.innerText.includes('Loading your workspace…'))
        window.__collectDeskNavigationAudit.loadingFlash=true;
    });
    observer.observe(document.body,{childList:true,subtree:true});
  });
  const durations=[];
  for(const [path,title] of [
    ['/cases','All cases'],
    ['/notifications','Activity updates'],
    ['/account','Account & access'],
    ['/organization','Organization'],
    ['/support','Help & support'],
    ['/dashboard','Overview']
  ]){
    const start=performance.now();
    await page.locator('.sidebar-nav a[href="'+path+'"]').click();
    await page.waitForURL(base+path,{timeout:15000});
    await page.getByRole('heading',{name:title,exact:true}).first().waitFor({timeout:15000});
    durations.push({path,ms:Math.round(performance.now()-start)});
    const fullPageLoader=page.getByText('Loading your workspace…');
    assert.equal(await fullPageLoader.count(),0,
      'Sidebar navigation unexpectedly blanked the workspace on '+path);
  }

  assert.equal(sessionRequests,initialChecks,
    'Sidebar navigation should reuse the recent session instead of asking /auth/me again');
  const observed=await page.evaluate(()=>window.__collectDeskNavigationAudit);
  assert.deepEqual(observed,{loadingFlash:false},'Navigation must stay in the same document without a loader flash.');
  console.table(durations);
  await context.close();
  console.log('Persistent workspace navigation passed: 6 routes, no auth loading flash, no repeated session fetch.');
} finally{
  await browser.close();
}
