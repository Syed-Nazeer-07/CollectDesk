/** Measure actual page overflow across supported layouts on a local fictional database. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base='http://localhost:3000';
const password=process.env.DEMO_SEED_PASSWORD;
assert.ok(password,'Set DEMO_SEED_PASSWORD for the local fixture.');
const browser=await chromium.launch();
const output='browser-audit-results/layout';
await fs.mkdir(output,{recursive:true});
const failures=[];
let checks=0;
try {
  const context=await browser.newContext({reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',error=>failures.push(error.message));
  const roles=[
    ['public',[['/','.lp-hero'],['/login','.auth-form, .auth-field'],['/signup','.auth-unavailable, .auth-field'],['/forgot-password','.auth-unavailable, .auth-form'],['/reset-password?token=layout-test-only','.auth-card'],['/signup/verify?token=layout-test-only','.auth-card'],['/staff/activate?token=layout-test-only','.staff-activation-card']]],
    ['creditor',[['/dashboard','.metrics-grid'],['/reports','.report-table'],['/cases','.cases-table'],['/cases/new','.new-case-form'],['/account','.profile-form'],['/support','.support-form'],['/notifications','[aria-label="Filter activity updates"]']]],
    ['admin',[['/dashboard','.metrics-grid'],['/cases','.cases-table'],['/staff','.staff-form'],['/follow-ups','.ops-metrics'],['/reports','.report-table'],['/operations','.health-grid']]],
    ['operator',[['/dashboard','.metrics-grid'],['/cases','.cases-table'],['/follow-ups','.ops-metrics'],['/reports','.report-table']]]
  ];
  for (const [role,routes] of roles){
    if(role!=='public'){
      const login=await context.request.post(base+'/api/v1/auth/login',{
        headers:{Origin:base},data:{email:role+'@demo.collectdesk.test',password}
      });
      assert.equal(login.status(),200);
      {
        const result=await context.request.get(base+'/api/v1/cases?limit=1');
        const {cases}=await result.json();
        assert.ok(cases.length>0,'Seeded '+role+' must have accessible cases');
        routes.push(['/cases/'+cases[0].id,'.detail-head']);
      }
    }
    for(const [route,ready] of routes){
      await page.goto(base+route,{waitUntil:'domcontentloaded'});
      await page.locator(ready).first().waitFor({timeout:10000});
      for(const theme of ['light','dark']){
        await page.evaluate(theme=>localStorage.setItem('cd-theme',theme),theme);
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator(ready).first().waitFor();
        await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
        for(const width of [360,390,768,1366,1920]){
          await page.setViewportSize({width,height:900});
          const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
          if(overflow>1) failures.push({route,theme,width,overflow});
          if(route.startsWith('/cases/')&&route!=='/cases/new'&&width<=650){
            const amount=await page.locator('.detail-amount strong').evaluate(el=>{
              const range=document.createRange();range.selectNodeContents(el);
              return {lines:range.getClientRects().length,overflow:el.scrollWidth-el.clientWidth};
            });
            if(amount.lines!==1||amount.overflow>1)failures.push({route,theme,width,amount});
          }
          checks++;
          if(width===390||width===1366){
            const slug=role+'-'+(route.startsWith('/cases/')&&route!=='/cases/new'?'case-detail':route.split('?')[0].replaceAll('/','-').slice(1)||'landing');
            await page.screenshot({path:output+'/'+slug+'-'+theme+'-'+width+'.png',animations:'disabled'});
          }
        }
      }
    }
    if(role==='creditor'){
      await page.goto(base+'/cases',{waitUntil:'domcontentloaded'});
      for(const theme of ['light','dark']){
        await page.evaluate(theme=>localStorage.setItem('cd-theme',theme),theme);
        await page.reload({waitUntil:'domcontentloaded'});
        await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
        for(const width of [360,390,768,1366,1920]){
          await page.setViewportSize({width,height:900});
          await page.getByRole('button',{name:'New case',exact:true}).click();
          const dialog=page.getByRole('dialog',{name:'New case'});
          await dialog.waitFor();
          const fits=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth+1});
          if(!fits)failures.push({route:'case-intake-dialog',theme,width});
          checks++;
          if(width===390||width===1366)await page.screenshot({path:output+'/creditor-intake-dialog-'+theme+'-'+width+'.png',animations:'disabled'});
          await page.keyboard.press('Escape');
          await dialog.waitFor({state:'hidden'});
        }
      }
    }
  }
  console.log(JSON.stringify({checks,failures},null,2));
  assert.equal(failures.length,0,'See routes and dimensions above.');
} finally {
  await browser.close();
}
