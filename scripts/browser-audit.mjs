/**
 * Headless Chromium browser audit against a running fictional CollectDesk demo.
 * Never point this at production. Uses the seed accounts and creates only synthetic cases.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const password = process.env.DEMO_SEED_PASSWORD;
if (!password || password.length < 12) {
  console.error('Set DEMO_SEED_PASSWORD (12+ chars) for the seeded fictional demo.');
  process.exit(2);
}
await fs.mkdir('browser-audit-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const sessions = [];
let step = 'initialization';


// Primary actions use white text and a sufficiently dark orange background.
// Calculate contrast from the browser's computed colors, not hard-coded tokens.
async function assertPrimaryContrast(page,selector){
  const {textColor,background}=await page.locator(selector).first().evaluate(node=>{
    const style=getComputedStyle(node);
    return {textColor:style.color,background:style.backgroundColor};
  });
  function luminance(color){
    const parts=color.match(/[\d.]+/g)?.slice(0,3).map(Number);
    assert.ok(parts?.length===3,'Expected an RGB color for '+selector+': '+color);
    const linear=parts.map(n=>{
      const v=n/255;
      return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
    });
    return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
  }
  const fg=luminance(textColor),bg=luminance(background);
  const ratio=(Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
  assert.ok(ratio>=4.5,
    selector+' contrast below WCAG AA: '+ratio.toFixed(2)+' ('+textColor+' on '+background+')');
  assert.ok(fg>bg,'Primary action should use light text on orange.');
}

// Measure actual browser layout: catch inline icon/text collisions in empty states.
async function assertEmptyStateLayout(page,containerSelector,iconSelector,titleSelector,textSelector){
  const measurements=await page.locator(containerSelector).first().evaluate((container,selectors)=>{
    const rect=(element)=>{
      if(!element)throw new Error('Missing empty-state child');
      const r=element.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,
        cx:r.left+r.width/2};
    };
    const icon=container.querySelector(selectors.icon);
    const title=container.querySelector(selectors.title);
    const description=container.querySelector(selectors.text);
    const containerRect=rect(container);
    const style=getComputedStyle(container);
    return {container:containerRect,icon:rect(icon),title:rect(title),
      text:rect(description),display:style.display,direction:style.flexDirection};
  },{icon:iconSelector,title:titleSelector,text:textSelector});
  assert.equal(measurements.display,'flex',containerSelector+' should be a flex layout');
  assert.equal(measurements.direction,'column',containerSelector+' should stack vertically');
  assert.ok(measurements.icon.bottom+3<=measurements.title.top,
    containerSelector+' icon overlaps heading');
  assert.ok(measurements.title.bottom+3<=measurements.text.top,
    containerSelector+' heading overlaps description');
  assert.ok(Math.abs(measurements.icon.cx-measurements.container.cx)<8,
    containerSelector+' icon should be centered');
  assert.ok(Math.abs(measurements.title.cx-measurements.container.cx)<8,
    containerSelector+' heading should be centered');
}

async function session(email, mobile = false) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 },
    deviceScaleFactor: 1
  });
  sessions.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  if (email === 'creditor@demo.collectdesk.test') {
    // Public customer onboarding must be accessible at the main URL on desktop and mobile.
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Every overdue invoice deserves/i }).waitFor();
    const startLink = page.getByRole('link', { name: /Create a creditor account/i });
    assert.equal(await startLink.getAttribute('href'), '/login?mode=signup',
      'Landing page account creation must open the existing registration flow');
    assert.equal(await page.locator('.cdl-feature').count(), 4,
      'Landing page should explain the core product capabilities');
    assert.equal(await page.locator('.cdl-step').count(), 3,
      'Customer onboarding should clearly explain each step');
    assert.equal(await page.title(), 'collectDesk',
      'Browser tab should use the short collectDesk brand name');
    assert.equal(await page.locator('.lp-brand svg.lp-brand-mark').count(),2,
      'The landing header and footer should use the shared vector mark');
    if(!mobile){
      const nav=page.getByRole('navigation',{name:'Main navigation'});
      for(const [name,target] of [
        ['Features','features'],['Lifecycle','stages'],['Roles','roles'],['FAQ','faq']
      ]){
        await nav.getByRole('link',{name,exact:true}).click();
        await page.waitForFunction(id=>{
          const link=document.querySelector('.lp-nav-link[href="#'+id+'"]');
          return link?.getAttribute('aria-current')==='location' &&
            link.classList.contains('lp-active') &&
            document.querySelectorAll('.lp-nav-link.lp-active').length===1;
        },target);
      }
      await page.evaluate(()=>document.getElementById('roles')?.scrollIntoView({behavior:'instant',block:'start'}));
      await page.waitForFunction(()=>
        document.querySelector('.lp-nav-link[href="#roles"]')?.getAttribute('aria-current')==='location'
      );
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      await page.waitForFunction(()=>window.scrollY<5);
    }
    assert.ok(await page.locator('link[rel="icon"][href*="icon.svg"]').count() > 0,
      'Website favicon should be present in the browser tab');
    assert.equal(await page.locator('.lp-f-orange, .lp-f-sky').count(),0,
      'Unnecessary circular floating graphics must not be displayed');
    assert.equal(await page.locator('.cdl-feature[href="#stages"]').count(),4,
      'Feature cards should be real links into the case lifecycle');
    assert.equal(await page.locator('.lp-chip[href^="#stage-"]').count(),7,
      'Rotating lifecycle labels should link to their stages');
    const roleColor=await page.locator('#roles h2').evaluate(el=>getComputedStyle(el).color);
    assert.notEqual(roleColor,'rgb(244, 238, 221)',
      'Roles heading must remain readable on the cream-colored section');
    const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.equal(overflowing, false, 'Landing page must not overflow the viewport');
    await page.screenshot({
      path: mobile ? 'browser-audit-results/mobile-landing.png' : 'browser-audit-results/desktop-landing.png',
      fullPage: true
    });
    await assertPrimaryContrast(page,'.lp .lp-btn-accent');
    await startLink.click();
    await page.waitForURL(/\/login\?mode=signup(?:&.*)?$/);
    await page.getByRole('heading', { name: 'Create your account' }).waitFor();
  }
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  // Catch brand/tagline collisions and undersized fields before signing in.
  const layout = await page.evaluate(async () => {
    await document.fonts.ready;
    const rect = selector => {
      const node = document.querySelector(selector);
      if (!node) throw new Error('Missing login element: ' + selector);
      return node.getBoundingClientRect().toJSON();
    };
    return {
      brand: rect('.story-brand'),
      tagline: rect('.story-tag'),
      story: rect('.login-story'),
      panel: rect('.login-panel'),
      email: rect('.login-form input[type="email"]'),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });
  // The branding story is intentionally hidden at mobile widths, so both
  // elements have zero-sized boxes there and cannot overlap.
  if (!mobile) assert.ok(layout.brand.bottom + 6 <= layout.tagline.top, 'Brand overlaps login tagline');
  assert.equal(await page.locator('.story-brand svg.brand-mark').count(),1,
    'Login screen should use the shared CollectDesk logo');
  // GIS's personalized sign-in widget is cross-origin, so its interior
  // cannot be inspected in CI. Guard the containing iframe styles against
  // inheriting dark color-scheme and showing a white rectangular gutter.
  const googleFrameStyle=await page.evaluate(()=>{
    const wrap=document.createElement('div');
    wrap.className='auth-google-button';
    const iframe=document.createElement('iframe');
    wrap.appendChild(iframe);
    document.body.appendChild(wrap);
    const outer=getComputedStyle(wrap),inner=getComputedStyle(iframe);
    const result={
      colorScheme:inner.colorScheme,
      outerColorScheme:outer.colorScheme,
      overflow:outer.overflow,
      display:inner.display,
      borderWidth:inner.borderTopWidth
    };
    wrap.remove();
    return result;
  });
  assert.equal(googleFrameStyle.colorScheme,'normal','Google iframe should not inherit dark color-scheme');
  assert.equal(googleFrameStyle.outerColorScheme,'normal','Google button wrapper should avoid dark scheme');
  assert.equal(googleFrameStyle.overflow,'hidden','Google button should clip external iframe gutters');
  assert.equal(googleFrameStyle.display,'block','Google iframe must not create inline baseline gaps');
  assert.ok(layout.email.height >= 50, 'Login fields are too small to use comfortably');
  await assertPrimaryContrast(page,'.login-submit');
  if(!mobile && email==='creditor@demo.collectdesk.test'){
    // Verify both dark and light primary actions, then restore the original theme.
    await page.locator('.theme-toggle-btn').click();
    await assertPrimaryContrast(page,'.login-submit');
    await page.locator('.theme-toggle-btn').click();
  }
  assert.equal(layout.horizontalOverflow, false, 'Login page overflows horizontally');
  if (!mobile) assert.ok(layout.panel.width > layout.story.width, 'Sign-in panel should be wider than branding');
  if (!mobile && email === 'creditor@demo.collectdesk.test') {
    await page.screenshot({ path: 'browser-audit-results/desktop-login.png', fullPage: true });
    assert.equal(await page.locator('.demo-access, .account-picker').count(), 0,
      'The login page must not expose demo-account selectors');
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByRole('heading', { name: 'Create your account' }).waitFor();
    assert.match(page.url(), /\/login\?mode=signup$/,
      'Create account should open in the same right-hand panel');
    await page.goto(base + '/signup', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Create your account' }).waitFor();
    assert.match(page.url(), /\/login\?mode=signup$/,
      'Legacy signup URL should redirect into the unified auth page');
    await page.getByRole('tab', { name: 'Sign in' }).click();
    await page.locator('.login-form input[type="email"]').waitFor();
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.getByRole('heading', { name: 'Forgot your password?' }).waitFor();
    await page.goto(base + '/reset-password?token=ci-bogus-token-value-only-for-layout-test');
    await page.getByRole('heading', { name: 'Set a new password' }).waitFor();
    await page.locator('input[autocomplete="new-password"]').first().waitFor();
    await page.goto(base + '/login', {waitUntil:'domcontentloaded'});
    await page.locator('.login-form input[type="email"]').waitFor();
  }
  if (mobile)
    await page.screenshot({ path: 'browser-audit-results/mobile-login.png', fullPage: true });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard(?:\?.*)?$/);
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  assert.equal(await page.locator('.sidebar-top svg.brand-mark').count(),1,
    'Workspace sidebar should use the same logo mark');

  await page.locator('.metrics-grid').waitFor();
  const topbarColor=await page.locator('.topbar').evaluate(node=>getComputedStyle(node).backgroundColor);
  assert.notEqual(topbarColor,'rgba(0, 0, 0, 0)','Sticky workspace toolbar needs an opaque theme background');
  assert.notEqual(topbarColor,'transparent','Sticky workspace toolbar must not be transparent');
  if(email==='creditor@demo.collectdesk.test'){
    await assertPrimaryContrast(page,'.page-heading .button-primary');
    await assertPrimaryContrast(page,'.action-row-symbol');
  }
  const horizontalOverflow=await page.evaluate(()=>
    document.documentElement.scrollWidth>window.innerWidth+2);
  assert.equal(horizontalOverflow,false,'Dashboard must fit its viewport');
  return page;
}
async function statusIs(page, status) {
  await page.locator('.detail-headline .status').filter({ hasText: status }).waitFor();
}
function log(message) { console.log('PASS ' + message); }
try {
  step = 'creditor login and case creation';
  const creditor = await session('creditor@demo.collectdesk.test');
  await creditor.screenshot({ path: 'browser-audit-results/creditor-dashboard.png', fullPage: true });

  step = 'support request intake and navigation';
  const supportSubject='Browser audit request '+Date.now();
  await creditor.getByRole('navigation',{name:'Main navigation'})
    .getByRole('link',{name:'Help & support'}).click();
  await creditor.getByRole('heading',{name:'Help & support',exact:true}).waitFor();
  const supportHeaderLayout=await creditor.locator('.support-layout').evaluate(root=>{
    const headers=[...root.querySelectorAll('.support-panel-head')].map(el=>{
      const r=el.getBoundingClientRect(),icon=el.querySelector('.support-heading-icon').getBoundingClientRect(),
        heading=el.querySelector('h2').getBoundingClientRect();
      return {top:r.top,height:r.height,left:r.left,iconRight:icon.right,headingLeft:heading.left,
        titleTop:heading.top,titleBottom:heading.bottom};
    });
    return {headers,overflow:document.documentElement.scrollWidth>window.innerWidth+2};
  });
  assert.equal(supportHeaderLayout.headers.length,2,'Support cards should share a header component');
  assert.ok(Math.abs(supportHeaderLayout.headers[0].top-supportHeaderLayout.headers[1].top)<3,
    'Support cards must align vertically');
  assert.ok(Math.abs(supportHeaderLayout.headers[0].height-supportHeaderLayout.headers[1].height)<3,
    'Support card headers should have the same height');
  for(const header of supportHeaderLayout.headers)
    assert.ok(header.iconRight+6<header.headingLeft,'Support icon must not overlap heading');
  assert.equal(supportHeaderLayout.overflow,false,'Support cards must not overflow the viewport');
  await creditor.getByText('No requests yet').waitFor();
  await assertEmptyStateLayout(creditor,'.support-list-state','.support-empty-icon','strong','p');
  await creditor.getByLabel('Subject').fill(supportSubject);
  await creditor.getByLabel('Describe the issue')
    .fill('This is a fictional browser audit request. No real customer data is involved.');
  await creditor.getByRole('button',{name:'Send support request'}).click();
  await creditor.getByRole('heading',{name:supportSubject}).waitFor();
  await creditor.screenshot({path:'browser-audit-results/creditor-support.png',fullPage:true});
  await creditor.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});
  log('Creditors can submit and track private support requests');

  step = 'workspace navigation and account permissions';
  const accountLink = creditor.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /Account & access/i });
  await accountLink.click();
  await creditor.getByRole('heading', { name: 'Account & access', exact: true }).waitFor();
  await creditor.getByRole('heading', { name: 'What you can do' }).waitFor();
  assert.equal(await creditor.getByRole('button', { name: 'Sign out', exact: true }).count(), 1, 'Sign-out should be clearly labelled');
  assert.equal(await creditor.locator('.workspace-identity').getAttribute('role'), null, 'Workspace identity must not pretend to be a control');
  await creditor.screenshot({ path: 'browser-audit-results/account-access.png', fullPage: true });
  await creditor.getByRole('link', { name: /Open case register/i }).click();
  await creditor.getByRole('heading', { name: 'All cases', exact: true }).waitFor();

  await creditor.goto(base + '/dashboard', { waitUntil: 'domcontentloaded' });
  await creditor.locator('.status-breakdown-row').first().waitFor();
  const firstFilter = creditor.locator('.status-breakdown-row').first();
  const targetUrl = await firstFilter.getAttribute('href');
  assert.ok(targetUrl?.startsWith('/cases?status='), 'Status breakdown must link to a real filter');
  const selectedStatus = new URL(targetUrl, base).searchParams.get('status');
  await firstFilter.click();
  await creditor.getByRole('heading', { name: 'All cases', exact: true }).waitFor();
  await creditor.waitForFunction(s => document.querySelector('select[aria-label="Filter by status"]')?.value === s, selectedStatus);
  // URL-driven filters must update after client-side changes and browser history navigation.
  await creditor.getByLabel('Filter by status').selectOption('draft');
  await creditor.waitForURL(/\/cases\?status=draft$/);
  await creditor.getByRole('button', { name: 'Clear filters' }).first().click();
  await creditor.waitForURL(/\/cases$/);
  assert.equal(await creditor.getByLabel('Filter by status').inputValue(),'all');
  // New reporting controls remain URL-driven and exports obey the same filters.
  await creditor.getByLabel('Sort cases').selectOption('due');
  await creditor.waitForURL(/\/cases\?sort=due$/);
  await creditor.getByLabel('Sort cases').selectOption('amount');
  await creditor.waitForURL(/\/cases\?sort=amount$/);
  const downloadPromise=creditor.waitForEvent('download');
  await creditor.getByRole('button',{name:/Export CSV/i}).click();
  const report=await downloadPromise;
  assert.equal(report.suggestedFilename(),'collectdesk-cases.csv');
  await creditor.getByLabel('Sort cases').selectOption('updated');
  await creditor.waitForURL(/\/cases$/);
  log('Case register sorting and authorized CSV downloads work');
  await creditor.goto(base + '/cases?status=submitted', { waitUntil: 'domcontentloaded' });
  await creditor.getByLabel('Filter by status').waitFor();
  assert.equal(await creditor.getByLabel('Filter by status').inputValue(),'submitted');
  await creditor.getByRole('searchbox',{name:'Search cases'}).fill('zz-no-matching-case-ui-audit-987');
  await creditor.getByRole('heading',{name:'No matching cases'}).waitFor();
  await assertEmptyStateLayout(creditor,'.cases-empty-filter','.cases-empty-icon','h4','p');
  await creditor.screenshot({path:'browser-audit-results/cases-empty-desktop.png',fullPage:true});
  await creditor.locator('.cases-empty-filter').getByRole('button',{name:'Clear filters'}).click();
  log('Account access, empty-state alignment and URL-synchronized case filtering work');

  step = 'creditor login and case creation';
  await creditor.goto(base + '/cases/new', { waitUntil: 'domcontentloaded' });
  await creditor.locator('input[name="debtorName"]').fill('Browser Audit Fictional Supplies');
  const invoiceNo = 'AUDIT-' + Date.now();
  await creditor.locator('input[name="invoiceNo"]').fill(invoiceNo);
  await creditor.locator('input[name="issueDate"]').fill('2026-01-01');
  await creditor.locator('input[name="dueDate"]').fill('2099-12-31');
  await creditor.locator('input[name="amount"]').fill('1000.00');
  await creditor.getByRole('button', { name: /Submit for review/i }).click();
  await creditor.getByRole('alert').getByText(/Only overdue invoices can be submitted/i).waitFor();
  assert.match(creditor.url(), /\/cases\/new$/, 'Rejected future-due invoice must not create a case');
  await creditor.locator('input[name="dueDate"]').fill('2026-02-01');
  await creditor.locator('input[name="amount"]').fill('1000.00');
  await creditor.locator('textarea[name="description"]').fill('Fictional QA record; do not contact a real debtor.');
  await creditor.getByRole('button', { name: /Submit for review/i }).click();
  await creditor.waitForURL(/\/cases\/[0-9a-f]{24}(?:\?.*)?$/i);
  const caseUrl = creditor.url();
  await statusIs(creditor, 'Submitted');
  log('Creditor created and submitted an overdue fictional invoice through the UI');

  step = 'admin review and assignment';
  const admin = await session('admin@demo.collectdesk.test');
  step='administrator staff-invitation workspace';
  await admin.goto(base+'/staff',{waitUntil:'domcontentloaded'});
  await admin.getByRole('heading',{name:'Staff invitations',exact:true}).waitFor();
  await admin.getByRole('heading',{name:'Invite an operator'}).waitFor();
  await admin.getByRole('button',{name:'Send operator invitation'}).waitFor();
  assert.equal(await admin.getByRole('link',{name:'Staff invitations'}).count(),1,
    'Administrator should have exactly one staff-management navigation link');
  assert.equal(await creditor.getByRole('link',{name:'Staff invitations'}).count(),0,
    'Creditor sidebar must not show staff invitation management');
  log('Only administrators see staff invitation management in the workspace');
  step='administrator support triage';
  await admin.goto(base+'/support',{waitUntil:'domcontentloaded'});
  const incoming=admin.locator('.support-ticket').filter({hasText:supportSubject});
  await incoming.getByRole('heading',{name:supportSubject}).waitFor();
  await incoming.locator('select').selectOption('resolved');
  await incoming.locator('textarea').fill('The team verified the sample request and provided a resolution.');
  await incoming.getByRole('button',{name:'Save update'}).click();
  await incoming.locator('.support-pill-resolved').waitFor();
  await creditor.goto(base+'/support',{waitUntil:'domcontentloaded'});
  const tracked=creditor.locator('.support-ticket').filter({hasText:supportSubject});
  await tracked.locator('.support-resolution p').waitFor();
  assert.equal(await tracked.locator('.support-resolution p').innerText(),
    'The team verified the sample request and provided a resolution.');
  // Return to the case before subsequent receipt/privacy assertions.
  await creditor.goto(caseUrl,{waitUntil:'domcontentloaded'});
  await statusIs(creditor,'Submitted');
  log('Admin resolution is visible to the original requester');
  step = 'admin review and assignment';
  await admin.goto(caseUrl, { waitUntil: 'domcontentloaded' });
  await statusIs(admin, 'Submitted');
  await admin.locator('.actions-panel textarea').first().fill('Approved fictional claim for UI audit.');
  await admin.getByRole('button', { name: /Save review decision/i }).click();
  await statusIs(admin, 'Accepted');
  await admin.getByRole('button', { name: /Assign case/i }).click();
  await statusIs(admin, 'In Progress');
  log('Admin accepted and assigned the case');

  step = 'admin hold and resume controls';
  await admin.getByRole('button', { name: 'Place on hold' }).click();
  await admin.getByLabel('Reason for placing on hold').fill('Waiting for fictional supporting documents');
  await admin.getByRole('button', { name: 'Confirm hold' }).click();
  await statusIs(admin, 'On Hold');
  await admin.getByRole('button', { name: 'Resume case' }).click();
  await admin.getByLabel('Reason for resuming').fill('Fictional documents received');
  await admin.getByRole('button', { name: 'Confirm resume' }).click();
  await statusIs(admin, 'In Progress');
  log('Administrator held and resumed an assigned case with documented reasons');

  step = 'operator visibility and updates';
  const operator = await session('operator@demo.collectdesk.test');
  await operator.goto(caseUrl, { waitUntil: 'domcontentloaded' });
  await statusIs(operator, 'In Progress');
  await operator.getByRole('textbox', { name: 'Add case activity' }).fill('Private browser audit internal note');
  await operator.getByLabel('Visibility').selectOption('internal');
  await operator.getByRole('button', { name: /Post update/i }).click();
  await operator.getByText('Private browser audit internal note').waitFor();
  await operator.getByRole('textbox', { name: 'Add case activity' }).fill('Public browser audit progress update');
  await operator.getByLabel('Visibility').selectOption('creditor');
  await operator.getByRole('button', { name: /Post update/i }).click();
  await operator.getByText('Public browser audit progress update').waitFor();
  log('Assigned operator posted public and internal activity');

  step = 'tenant privacy';
  const otherCreditor = await session('creditor2@demo.collectdesk.test');
  await otherCreditor.goto(caseUrl, { waitUntil: 'domcontentloaded' });
  await otherCreditor.getByText('Case not found.').first().waitFor();
  log('Another creditor organization cannot open the case');

  step = 'internal note privacy and verified receipts';
  await creditor.reload();
  await creditor.getByText('Public browser audit progress update').waitFor();
  const privateVisible = await creditor.getByText('Private browser audit internal note').count();
  assert.equal(privateVisible, 0, 'Internal staff note leaked to creditor UI');
  await admin.reload();
  await admin.getByLabel('Amount (INR)').fill('250');
  await admin.getByLabel('Evidence reference').fill('AUDIT-RECEIPT-001');
  await admin.getByRole('button', { name: /Record pending receipt/i }).click();
  await admin.locator('.receipt-row .status').filter({ hasText: 'Awaiting verification' }).waitFor();
  await admin.getByLabel('Amount (INR)').fill('10');
  await admin.getByLabel('Evidence reference').fill('AUDIT-REJECT-PENDING');
  await admin.getByRole('button', { name: /Record pending receipt/i }).click();
  const wrongReceipt=admin.locator('.receipt-row').filter({hasText:'AUDIT-REJECT-PENDING'});
  await wrongReceipt.getByRole('button', {name:'Reject pending'}).click();
  await wrongReceipt.getByLabel('Reason for rejecting pending receipt').fill('Incorrect fictional reference');
  await wrongReceipt.getByRole('button', {name:'Confirm pending rejection'}).click();
  await wrongReceipt.getByText('Rejected', {exact:true}).waitFor();
  await admin.getByRole('button', { name: 'Verify', exact: true }).click();
  await admin.getByText('Verified', { exact: true }).last().waitFor();
  await creditor.reload();
  await creditor.getByText('Public browser audit progress update').waitFor();
  const figures = await creditor.locator('.detail-metrics').innerText();
  assert.match(figures, /250/);
  assert.match(figures, /50/);
  await creditor.screenshot({ path: 'browser-audit-results/verified-case.png', fullPage: true });
  log('Creditor sees public updates and verified recovery, but not internal notes');

  step = 'receipt correction and case closure controls';
  await admin.getByRole('button', { name: 'Correct receipt' }).click();
  await admin.getByLabel('Reason for correction').fill('Correcting the fictional test receipt');
  await admin.getByLabel('I understand this creates a separate reversing ledger entry').check();
  await admin.getByRole('button', { name: 'Reverse verified entry' }).click();
  await admin.locator('.receipt-row').filter({hasText:'(reversal)'}).waitFor();
  assert.equal(await admin.getByRole('button', { name: 'Correct receipt' }).count(),0,
    'A verified receipt must not offer a second reversal');
  await creditor.reload();
  assert.match(await creditor.locator('.detail-metric').nth(1).locator('b').innerText(), /0(?:\.00)?/,
    'Creditor recovery should reflect corrected receipt');
  await admin.getByRole('button', { name: 'Close case' }).click();
  await admin.getByLabel('Reason for closing').fill('Fictional workflow finished with remaining outstanding principal');
  await admin.getByLabel('I understand closure is final and may leave an outstanding balance').check();
  await admin.getByRole('button', { name: 'Confirm closure' }).click();
  await statusIs(admin, 'Closed');
  await creditor.reload();
  await statusIs(creditor, 'Closed');
  log('Admin corrected a verified receipt and closed the case with an audit reason');

  step = 'mobile layout navigation';
  const mobile = await session('creditor@demo.collectdesk.test', true);
  const navTrigger=mobile.getByRole('button',{name:'Open menu'});
  await navTrigger.click();
  assert.equal(await navTrigger.getAttribute('aria-expanded'),'true',
    'Mobile menu must announce its expanded state');
  await mobile.keyboard.press('Escape');
  assert.equal(await navTrigger.getAttribute('aria-expanded'),'false',
    'Escape must close the mobile menu');
  assert.equal(await mobile.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Open menu',
    'Escape should return keyboard focus to the menu button');
  await navTrigger.click();
  await mobile.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /All cases/i }).click();
  await mobile.getByRole('heading', { name: 'All cases', exact: true }).waitFor();
  await mobile.locator('.loading-panel').waitFor({ state: 'hidden' });
  const mobileCount = Number(await mobile.locator('.case-list-title h3 span').innerText());
  assert.ok(mobileCount > 0, 'Mobile case register did not load any demo records');
  await mobile.getByRole('searchbox',{name:'Search cases'}).fill('zz-no-matching-case-ui-audit-987');
  await mobile.getByRole('heading',{name:'No matching cases'}).waitFor();
  await assertEmptyStateLayout(mobile,'.cases-empty-filter','.cases-empty-icon','h4','p');
  await mobile.screenshot({path:'browser-audit-results/cases-empty-mobile.png',fullPage:true});
  await mobile.locator('.cases-empty-filter').getByRole('button',{name:'Clear filters'}).click();
  await mobile.locator('.cases-table tbody tr').first().waitFor();
  const pageOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  assert.equal(pageOverflow, false, 'Mobile page has unintended horizontal overflow');
  const firstMobileCard = mobile.locator('.cases-table tbody tr').first();
  const mobileInvoiceLayout=await firstMobileCard.locator('td').first().evaluate(cell=>{
    const link=cell.querySelector('.table-case');
    const meta=cell.querySelector('.table-muted');
    const outer=cell.getBoundingClientRect(),code=link.getBoundingClientRect(),invoice=meta.getBoundingClientRect();
    return {display:getComputedStyle(cell).display,left:outer.left,width:outer.width,codeLeft:code.left,
      codeRight:code.right,invoiceRight:invoice.right};
  });
  assert.equal(mobileInvoiceLayout.display,'grid','Mobile case/invoice cell needs an explicit two-column grid');
  assert.ok(mobileInvoiceLayout.codeLeft>mobileInvoiceLayout.left+mobileInvoiceLayout.width*.28,
    'Mobile case ID must not overlap the Case / invoice label');
  assert.ok(mobileInvoiceLayout.codeRight<=mobileInvoiceLayout.left+mobileInvoiceLayout.width+2,
    'Mobile case ID extends beyond its card');
  assert.ok(mobileInvoiceLayout.invoiceRight<=mobileInvoiceLayout.left+mobileInvoiceLayout.width+2,
    'Mobile invoice number extends beyond its card');
  const cardBounds = await firstMobileCard.evaluate(node => {
    const rect=node.getBoundingClientRect();
    return { width:rect.width, right:rect.right, viewport:window.innerWidth };
  });
  assert.ok(cardBounds.right <= cardBounds.viewport + 2, 'Mobile case card extends beyond the viewport');
  assert.equal(await firstMobileCard.locator('td[data-label]').count(), 6, 'Mobile case card omits key fields');
  await firstMobileCard.getByRole('link', { name: /View case/i }).waitFor();
  await mobile.screenshot({ path: 'browser-audit-results/mobile-cases.png', fullPage: true });
  await firstMobileCard.getByRole('link', { name: /View case/i }).click();
  await mobile.getByRole('heading', { name: 'Case details', exact: true }).waitFor();
  log('Mobile cases show all fields as cards with a functioning View action');
  console.log('All browser audit scenarios passed. Screenshots saved in browser-audit-results/.');
} catch (error) {
  console.error('FAIL browser audit at step "' + step + '":', error.stack || String(error));
  for (const [index, context] of sessions.entries()) {
    try {
      const page = context.pages()[0];
      if (page) await page.screenshot({ path: 'browser-audit-results/failure-' + index + '.png', fullPage: true });
    } catch {}
  }
  process.exitCode = 1;
} finally {
  await Promise.all(sessions.map(context => context.close()));
  await browser.close();
}
