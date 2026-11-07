import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAccess,canEditDraft,canSubmit,canReview,canAssign,calculateMoney,formatCaseCode,isOverdue,indiaDateKey,pageInfo,scopeForUser} from '../src/rules.js';
test('creditor only sees own organization',()=>{
  const caseItem={organizationId:'A',assignedTo:'operator-x'};
  assert.equal(assertAccess({_id:'u1',role:'creditor',organizationId:'A'},caseItem),true);
  assert.equal(assertAccess({_id:'u2',role:'creditor',organizationId:'B'},caseItem),false);
});
test('operator only sees assigned case; admin sees all',()=>{
  const item={organizationId:'A',assignedTo:'op1'};
  assert.equal(assertAccess({_id:'op1',role:'operator'},item),true);
  assert.equal(assertAccess({_id:'op2',role:'operator'},item),false);
  assert.equal(assertAccess({_id:'a',role:'admin'},item),true);
});
test('unknown role has no access',()=>assert.equal(assertAccess({role:'guest'},{}),false));
test('draft editing and submission lifecycle',()=>{
  assert.equal(canEditDraft('creditor','draft'),true);
  assert.equal(canEditDraft('creditor','needs_info'),true);
  assert.equal(canEditDraft('operator','draft'),false);
  assert.equal(canSubmit('submitted'),false);
  assert.equal(canSubmit('needs_info'),true);
  assert.equal(canReview('draft'),false);
  assert.equal(canReview('submitted'),true);
  assert.equal(canAssign('accepted'),true);
  assert.equal(canAssign('submitted'),false);
});
test('unverified receipts never count as recovered',()=>{
  assert.deepEqual(calculateMoney(10000000,2000,[{status:'recorded',kind:'receipt',amountPaise:6000000}]),{recoveredPaise:0,outstandingPaise:10000000,feePaise:0});
});
test('verified partial receipt: correct fee and outstanding',()=>{
  assert.deepEqual(calculateMoney(10000000,2000,[{status:'verified',kind:'receipt',amountPaise:6000000}]),{recoveredPaise:6000000,outstandingPaise:4000000,feePaise:1200000});
});
test('verified reversal reduces net recovery and fee',()=>{
  assert.deepEqual(calculateMoney(10000000,2000,[{status:'verified',kind:'receipt',amountPaise:6000000},{status:'verified',kind:'reversal',amountPaise:1000000}]),{recoveredPaise:5000000,outstandingPaise:5000000,feePaise:1000000});
});
test('rejected receipt ignored',()=>assert.equal(calculateMoney(5000,1500,[{status:'rejected',kind:'receipt',amountPaise:4000}]).recoveredPaise,0));
test('half up fee rounding at paisa',()=>assert.equal(calculateMoney(1000,1500,[{status:'verified',kind:'receipt',amountPaise:1}]).feePaise,0));
test('reject over-recovery',()=>assert.throws(()=>calculateMoney(500,2000,[{status:'verified',kind:'receipt',amountPaise:501}])));
test('reject negative net recovery',()=>assert.throws(()=>calculateMoney(1000,2000,[{status:'verified',kind:'reversal',amountPaise:1}])));
test('reject unsafe currency amounts',()=>assert.throws(()=>calculateMoney(Number.MAX_SAFE_INTEGER+1,2000,[])));
test('case code formatting',()=>assert.equal(formatCaseCode('demo-0001'),'CC-DEMO-0001'));
test('fee rounds half-up when exactly half a paisa',()=>{
  assert.equal(calculateMoney(1000,2500,[{status:'verified',kind:'receipt',amountPaise:2}]).feePaise,1);
});
test('fee at 30 percent is calculated on verified amount not invoice',()=>{
  assert.equal(calculateMoney(10000000,3000,[{status:'verified',kind:'receipt',amountPaise:2500000}]).feePaise,750000);
});
test('pending and rejected items do not change verified recovery',()=>{
  assert.equal(calculateMoney(1000000,1500,[{status:'recorded',kind:'receipt',amountPaise:100000},{status:'rejected',kind:'receipt',amountPaise:200000},{status:'verified',kind:'receipt',amountPaise:300000}]).recoveredPaise,300000);
});

test('India business date handles the UTC day boundary',()=>{
  const instant=new Date('2026-11-07T19:00:00.000Z'); // 00:30 IST, 8 Nov
  assert.equal(indiaDateKey(instant),'2026-11-08');
  assert.equal(isOverdue('2026-11-07',instant),true);
  assert.equal(isOverdue('2026-11-08',instant),false);
  assert.equal(isOverdue('2026-11-09',instant),false);
  assert.equal(isOverdue('not-a-date',instant),false);
});
test('case pagination metadata counts remaining pages correctly',()=>{
  assert.deepEqual(pageInfo(2,25,51),{page:2,pageSize:25,total:51,totalPages:3});
  assert.deepEqual(pageInfo(1,25,0),{page:1,pageSize:25,total:0,totalPages:1});
});

test('missing tenant and unknown roles fail closed for queries and single cases',()=>{
  const c={organizationId:'org-one',assignedTo:'op-one'};
  assert.equal(assertAccess({role:'creditor'},c),false);
  assert.equal(assertAccess({role:'creditor'},{}),false);
  assert.equal(assertAccess({role:'operator'},c),false);
  assert.deepEqual(scopeForUser({role:'admin'}),{});
  assert.deepEqual(scopeForUser({role:'creditor',organizationId:'org-one'}),{organizationId:'org-one'});
  assert.deepEqual(scopeForUser({role:'creditor'}),{organizationId:{$exists:false}});
  assert.deepEqual(scopeForUser({role:'operator'}),{assignedTo:{$exists:false}});
  assert.deepEqual(scopeForUser({role:'guest'}),{_id:{$exists:false}});
});
