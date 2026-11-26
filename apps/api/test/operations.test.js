import test from 'node:test';
import assert from 'node:assert/strict';
import {reportRange,summarizeMovements} from '../src/operations.js';
test('reports use inclusive Indian dates and enforce a bounded interval',()=>{
  const r=reportRange('2026-11-26','2026-11-26');
  assert.equal(r.start.toISOString(),'2026-11-25T18:30:00.000Z');
  assert.equal(r.end.toISOString(),'2026-11-26T18:30:00.000Z');
  assert.equal(reportRange('2026-11-27','2026-11-26'),null);
  assert.equal(reportRange('2024-01-01','2025-01-01'),null);
});
test('report fills missing months and preserves negative net movements',()=>{
  const r=summarizeMovements([{_id:'2026-01',gross:'100',reversed:'200',count:2}], '2026-01-15','2026-03-03');
  assert.deepEqual(r.months.map(x=>x.netPaise),[-100,0,0]);
  assert.equal(r.totals.netPaise,-100);
  assert.throws(()=>summarizeMovements([{_id:'2026-01',gross:'9007199254740992',reversed:'0',count:1}],'2026-01-01','2026-01-31'));
});
