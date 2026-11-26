import mongoose from 'mongoose';
import {Case} from './models.js';
import {assertAccess,scopeForUser,calculateMoney,addPaise} from './rules.js';

export const transactionResponse=(status,body)=>({status,body});
class RejectedOperation extends Error {
  constructor(result){super('Rejected case operation');this.result=result;}
}

/** The case write is the serialization point. Concurrent operations conflict
 * and retry against a fresh snapshot; the response is sent only after commit.
 * No external side effects belong in the retryable callback. */
export async function withCaseTransaction(req,res,operation){
  let result;
  try{
    result=await mongoose.connection.transaction(async session=>{
      const current=await Case.findOneAndUpdate({
        _id:req.caseItem._id,...scopeForUser(req.user),
        $or:[{financialLockToken:null},{financialLockExpiresAt:{$lt:new Date()}}]
      },{$inc:{ledgerRevision:1},$set:{financialLockToken:null,financialLockExpiresAt:null}},{session,returnDocument:'after'}).lean();
      if(!current||!assertAccess(req.user,current))throw new RejectedOperation(transactionResponse(409,{error:'Case changed or is being updated. Refresh and retry.'}));
      req.caseItem=current;
      const response=await operation(session);
      if(!response||!Number.isInteger(response.status))throw new Error('Missing transaction response');
      if(response.status>=400)throw new RejectedOperation(response);
      return response;
    },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});
  }catch(error){
    if(error instanceof RejectedOperation)result=error.result;
    else throw error;
  }
  return res.status(result.status).json(result.body);
}

export async function assertTransactionTopology(connection){
  const hello=await connection.db.admin().command({hello:1});
  if(!hello.setName && hello.msg!=='isdbgrid')throw new Error('MongoDB replica set or sharded cluster required for atomic financial operations');
}

/** Report-only reconciliation. Legacy entries without structured audit IDs
 * are flagged, not fabricated or automatically repaired. */
export function inspectLedger(item,receipts,events){
  const issues=[];
  const id=String(item._id),org=String(item.organizationId);
  const valid=receipts.filter(r=>{
    if(String(r.organizationId)===org)return true;
    issues.push({code:'receipt_tenant_mismatch',receiptId:String(r._id)});return false;
  });
  const audit=events.filter(e=>{
    if(String(e.organizationId)===org)return true;
    issues.push({code:'audit_tenant_mismatch',eventId:String(e._id)});return false;
  });
  const originals=new Map(valid.filter(r=>r.kind==='receipt').map(r=>[String(r._id),r]));
  let totals=null,pendingPaise=0;
  try{
    totals=calculateMoney(item.principalPaise,item.feeRateBps,valid);
    pendingPaise=valid.filter(r=>r.status==='recorded'&&r.kind==='receipt').reduce((sum,r)=>addPaise(sum,r.amountPaise),0);
    if(pendingPaise>totals.outstandingPaise)issues.push({code:'pending_exceeds_outstanding'});
  }catch{issues.push({code:'invalid_ledger_totals'});}
  const reversed=new Set();
  const knownReceipts=new Set(valid.map(r=>String(r._id)));
  for(const event of audit){
    const linked=event.kind==='reversal'?event.metadata?.reversalId:event.metadata?.receiptId;
    if(linked&&!knownReceipts.has(String(linked)))issues.push({code:'orphan_audit_event',eventId:String(event._id)});
  }
  for(const r of valid){
    const receiptId=String(r._id);
    if(r.kind==='reversal'){
      const original=originals.get(String(r.reversedFrom));
      if(!original||original.status!=='verified'||original.amountPaise!==r.amountPaise||r.status!=='verified'||reversed.has(String(r.reversedFrom)))
        issues.push({code:'invalid_reversal',receiptId});
      reversed.add(String(r.reversedFrom));
    }
    const expected=r.kind==='reversal'?['reversal']:r.status==='verified'?['receipt','verified']:r.status==='rejected'?['receipt','receipt_rejected']:['receipt'];
    for(const kind of expected){
      const matches=audit.filter(e=>e.kind===kind&&String(kind==='reversal'?e.metadata?.reversalId:e.metadata?.receiptId)===receiptId);
      if(matches.length!==1)issues.push({code:matches.length?'duplicate_audit_event':'missing_or_legacy_audit',receiptId,kind});
      else if(matches[0].metadata?.amountPaise!==undefined&&matches[0].metadata.amountPaise!==r.amountPaise)
        issues.push({code:'audit_amount_mismatch',receiptId,kind});
    }
  }
  return {caseId:id,totals,pendingPaise,receiptCount:valid.length,issues,requiresReview:issues.length>0};
}
