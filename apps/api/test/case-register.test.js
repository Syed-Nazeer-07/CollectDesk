import test from 'node:test';
import assert from 'node:assert/strict';
import {caseSort,caseFilters,csvCell,casesCsv} from '../src/case-register.js';

test('register sorts use deterministic database keys',()=>{
  assert.deepEqual(caseSort('updated'),{updatedAt:-1,_id:-1});
  assert.deepEqual(caseSort('due'),{dueDate:1,_id:1});
  assert.deepEqual(caseSort('amount'),{principalPaise:-1,_id:-1});
});
test('case filters preserve organization/role restrictions',()=>{
  const scope={organizationId:'company-A'};
  const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const filter=caseFilters({status:'submitted',q:'INV-*'},scope,escaped);
  assert.equal(filter.organizationId,'company-A');
  assert.equal(filter.status,'submitted');
  assert.equal(filter.$or.length,3);
  assert.equal(filter.$or[1].invoiceNo.$regex,'INV-\\*');
});
test('CSV output quotes delimiters, sanitizes formula values and excludes internal fields',()=>{
  assert.equal(csvCell('ACME, Ltd.'),'"ACME, Ltd."');
  assert.equal(csvCell('=HYPERLINK("evil")'),'"\'=HYPERLINK(""evil"")"');
  assert.equal(csvCell('  +SUM(1,2)'),'"\'+SUM(1,2)"');
  assert.equal(csvCell('@danger'),'"\'@danger"');
  assert.equal(csvCell('one\r\ntwo'),'"one  two"');
  const csv=casesCsv([{
    caseCode:'CC-001',debtorName:'=1+1',invoiceNo:'INV-07',
    status:'draft',principalPaise:12345,dueDate:'2026-01-01',
    createdAt:'2026-01-02T10:00:00.000Z',updatedAt:'2026-01-03T10:00:00.000Z',
    internalNote:'never export',passwordHash:'also never export'
  }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv,/Invoice amount \(INR\)/);
  assert.ok(csv.includes('"123.45"'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(!csv.includes('never export'));
  assert.ok(!csv.includes('passwordHash'));
  assert.equal(csv.trim().split('\r\n').length,2);
});
