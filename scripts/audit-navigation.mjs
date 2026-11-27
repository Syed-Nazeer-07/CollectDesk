/**
 * Regression: client-side workspace navigation must not re-fetch /auth/me or
 * blank the whole workspace every time a Next.js sidebar Link is clicked.
 * Run ONLY against a disposable seeded fictional-data environment.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.AUDIT_BASE_URL || 'http://localhost:3000';
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

  for(const [path,title] of [
    ['/cases','All cases'],
    ['/reports','Recovery reports'],
    ['/notifications','Activity updates'],
    ['/account','Account & access'],
    ['/support','Help & support'],
    ['/dashboard','Overview']
  ]){
    await page.locator('.sidebar-nav a[href="'+path+'"]').click();
    await page.waitForURL(base+path,{timeout:15000});
    await page.getByRole('heading',{name:title,exact:true}).first().waitFor({timeout:15000});
    const fullPageLoader=page.getByText('Loading your workspace…');
    assert.equal(await fullPageLoader.count(),0,
      'Sidebar navigation unexpectedly blanked the workspace on '+path);
  }

  assert.equal(sessionRequests,initialChecks,
    'Sidebar navigation should reuse the recent session instead of asking /auth/me again');
  // Creation belongs to Cases, not an independent navigation section.
  assert.equal(await page.locator('.sidebar-nav a[href="/cases/new"]').count(),0);
  assert.equal(await page.locator('.topbar a[href="/"]').count(),0);
  await page.locator('.sidebar-nav a[href="/cases"]').click();
  await page.waitForURL(base+'/cases');
  const create=page.getByRole('button',{name:'New case',exact:true});
  await create.click();
  const intake=page.getByRole('dialog',{name:'New case'});
  await intake.waitFor();
  assert.equal(page.url(),base+'/cases','Intake must not navigate away from the register');
  assert.equal(await page.locator('.sidebar-nav a[href="/cases"]').getAttribute('aria-current'),'page');
  await intake.locator('input[name="debtorName"]').fill('Unsaved modal audit invoice');
  await page.keyboard.press('Escape');
  await intake.waitFor({state:'hidden'});
  assert.equal(await create.evaluate(el=>document.activeElement===el),true,'Focus must return to New case');
  await create.click();
  await intake.getByText('Recovered your unfinished invoice from this tab.').waitFor();
  assert.equal(await intake.locator('input[name="debtorName"]').inputValue(),'Unsaved modal audit invoice');
  page.once('dialog',dialog=>dialog.accept());
  await intake.getByRole('button',{name:'Cancel',exact:true}).click();
  await intake.waitFor({state:'hidden'});
  await create.click();
  assert.equal(await intake.locator('input[name="debtorName"]').inputValue(),'','Confirmed cancel clears local draft');
  await page.keyboard.press('Escape');
  await intake.waitFor({state:'hidden'});
  assert.equal(sessionRequests,initialChecks,'Opening or closing intake must not revalidate the session');
  await page.locator('.sidebar-nav a[href="/account"]').click();
  await page.waitForURL(base+'/account');
  const appearance=page.getByLabel('Theme preference');
  await appearance.waitFor();
  await page.emulateMedia({colorScheme:'dark'});
  await appearance.selectOption('system');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await appearance.selectOption('dark');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.reload({waitUntil:'domcontentloaded'});
  await appearance.waitFor();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.equal(await appearance.inputValue(),'dark');
  await appearance.selectOption('system');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await context.close();
  console.log('Persistent workspace navigation passed: 6 routes, no auth loading flash, no repeated session fetch.');
} finally{
  await browser.close();
}
