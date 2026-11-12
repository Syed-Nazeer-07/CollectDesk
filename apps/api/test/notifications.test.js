import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {notificationPipeline} from '../src/notifications.js';

const id=()=>new mongoose.Types.ObjectId();
function stages(user,page=1){return notificationPipeline(user,page);}
test('creditor notifications are tenant-scoped and never expose internal notes',()=>{
  const user={_id:id(),role:'creditor',organizationId:id()};
  const stagesForUser=stages(user);
  assert.deepEqual(stagesForUser[0].$match.organizationId,user.organizationId);
  assert.equal(stagesForUser[0].$match.visibility,'creditor');
  assert.deepEqual(stagesForUser[3].$match,{'case.organizationId':user.organizationId});
  assert.deepEqual(stagesForUser[0].$match.actorId,{$ne:user._id});
});
test('operators only see updates to cases currently assigned to them',()=>{
  const user={_id:id(),role:'operator'};
  const result=stages(user);
  assert.deepEqual(result[3].$match,{'case.assignedTo':user._id});
  assert.equal(result[0].$match.visibility,undefined);
});
test('administrators see the queue, with their own actions excluded',()=>{
  const user={_id:id(),role:'admin',notificationsSeenAt:new Date('2026-01-01')};
  const result=stages(user,3);
  assert.deepEqual(result[3].$match,{});
  assert.equal(result[4].$facet.items[1].$skip,40);
  assert.deepEqual(result[4].$facet.unread[0].$match,{createdAt:{$gt:user.notificationsSeenAt}});
});
test('unknown roles and creditors without a company are denied by aggregation scope',()=>{
  const unknown=stages({_id:id(),role:'guest'});
  assert.deepEqual(unknown[3].$match,{_id:{$exists:false}});
  const creditor=stages({_id:id(),role:'creditor',organizationId:null});
  assert.deepEqual(creditor[3].$match,{'case.organizationId':null});
});
