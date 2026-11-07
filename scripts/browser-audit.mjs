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

async function session(email, mobile = false) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 },
    deviceScaleFactor: 1
  });
  sessions.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Sign in to workspace/i }).click();
  await page.waitForURL(/\/dashboard(?:\?.*)?$/);
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
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
  await creditor.goto(base + '/cases/new', { waitUntil: 'domcontentloaded' });
  await creditor.locator('input[name="debtorName"]').fill('Browser Audit Fictional Supplies');
  const invoiceNo = 'AUDIT-' + Date.now();
  await creditor.locator('input[name="invoiceNo"]').fill(invoiceNo);
  await creditor.locator('input[name="issueDate"]').fill('2026-01-01');
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
  await admin.goto(caseUrl, { waitUntil: 'domcontentloaded' });
  await statusIs(admin, 'Submitted');
  await admin.locator('.actions-panel textarea').first().fill('Approved fictional claim for UI audit.');
  await admin.getByRole('button', { name: /Save review decision/i }).click();
  await statusIs(admin, 'Accepted');
  await admin.getByRole('button', { name: /Assign case/i }).click();
  await statusIs(admin, 'In Progress');
  log('Admin accepted and assigned the case');

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
  await admin.getByText('Awaiting verification').waitFor();
  await admin.getByRole('button', { name: 'Verify', exact: true }).click();
  await admin.getByText('Verified', { exact: true }).last().waitFor();
  await creditor.reload();
  await creditor.getByText('Public browser audit progress update').waitFor();
  const figures = await creditor.locator('.detail-metrics').innerText();
  assert.match(figures, /250/);
  assert.match(figures, /50/);
  await creditor.screenshot({ path: 'browser-audit-results/verified-case.png', fullPage: true });
  log('Creditor sees public updates and verified recovery, but not internal notes');

  step = 'mobile layout navigation';
  const mobile = await session('creditor@demo.collectdesk.test', true);
  await mobile.getByRole('button', { name: 'Open menu' }).click();
  await mobile.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /All cases/i }).click();
  await mobile.getByRole('heading', { name: 'All cases', exact: true }).waitFor();
  await mobile.screenshot({ path: 'browser-audit-results/mobile-cases.png', fullPage: true });
  log('Mobile navigation reaches the case register');
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
