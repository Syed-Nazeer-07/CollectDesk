import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRequests} from '../src/telemetry.js';
test('telemetry excludes stale samples and computes nearest-rank latency percentiles',()=>{
 const now=2_000_000;
 const result=summarizeRequests([{at:now-1_800_001,ms:10000,status:500},{at:now-1,ms:4,status:200},{at:now,ms:20,status:403},{at:now,ms:50,status:503}],now);
 assert.deepEqual(result,{sampleCount:3,success:1,clientError:1,serverError:1,other:0,p50Ms:20,p95Ms:50});
 assert.equal(summarizeRequests([],now).p95Ms,null);
});
