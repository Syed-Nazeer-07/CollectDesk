import {createHash, randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import {Case, FinancialRequest, Activity, Receipt, OrganizationInvite, OrganizationEvent, User} from './models.js';

export const transactionalLedger = () => process.env.LEDGER_TRANSACTIONS_REQUIRED === 'true';

export class FinancialError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function assertLedgerReady() {
  if (!transactionalLedger()) return;
  const topology = await mongoose.connection.db.admin().command({hello:1});
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    throw new Error('LEDGER_TRANSACTIONS_REQUIRED needs a replica set or sharded MongoDB cluster.');
  }
  // Ensure the replay key's unique index is present before serving writes.
  await Promise.all([Case.init(), Activity.init(), Receipt.init(), FinancialRequest.init(), User.init(), OrganizationInvite.init(), OrganizationEvent.init()]);
}

export async function writeFinancial(req, operation) {
  const key = req.get('Idempotency-Key');
  if (key !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw new FinancialError(422, 'Invalid idempotency key.');
  }
  if (!transactionalLedger()) {
    if (key !== undefined) throw new FinancialError(409, 'Idempotency requires the transactional ledger.');
    return writeWithDemoLease(req, operation);
  }

  const filter = {_id:req.caseItem._id, $or:[
    {financialLockToken:null}, {financialLockExpiresAt:{$lt:new Date()}}
  ]};
  const identity = {
    caseId:req.caseItem._id, actorId:req.user._id, action:req.path, key
  };
  const payload = req.body && typeof req.body === 'object'
    ? Object.fromEntries(Object.entries(req.body).sort(([a],[b])=>a.localeCompare(b)))
    : req.body;
  const fingerprint = createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');

  return mongoose.connection.transaction(async session => {
    // Every ledger writer writes the same case first. A conflicting
    // transaction retries from a new snapshot, including its balance reads.
    const current = await Case.findOneAndUpdate(filter, {$inc:{ledgerRevision:1}}, {
      returnDocument:'after', session, timestamps:false
    }).lean();
    if (!current) throw new FinancialError(409, 'Another update is in progress. Refresh and retry.');
    if (key) {
      const replay = await FinancialRequest.findOne(identity).session(session).lean();
      if (replay) {
        if (replay.fingerprint !== fingerprint)
          throw new FinancialError(409, 'This idempotency key was used with different input.');
        return {status:replay.status, body:replay.body};
      }
    }
    const result = await operation(current, session);
    if (key) await new FinancialRequest({...identity, fingerprint, ...result}).save({session});
    return result;
  }, {readConcern:{level:'snapshot'}, writeConcern:{w:'majority'}, readPreference:'primary'});
}

async function writeWithDemoLease(req, operation) {
  const token = randomUUID();
  const current = await Case.findOneAndUpdate({
    _id:req.caseItem._id,
    $or:[{financialLockToken:null},{financialLockExpiresAt:{$lt:new Date()}}]
  }, {$set:{financialLockToken:token,financialLockExpiresAt:new Date(Date.now()+120_000)}},
  {returnDocument:'after'}).lean();
  if (!current) throw new FinancialError(409, 'Another financial update is in progress. Refresh and retry.');
  try {
    return await operation(current, null);
  } finally {
    await Case.updateOne({_id:current._id,financialLockToken:token}, {
      $set:{financialLockToken:null,financialLockExpiresAt:null}
    }).catch(error=>console.error('[API] Ledger lease cleanup failed', {name:error.name}));
  }
}
