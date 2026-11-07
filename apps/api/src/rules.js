/** Pure domain rules, testable without a database. Amounts are INTEGER paise. */
export const ROLES = ['creditor', 'operator', 'admin'];
export const CASE_STATUSES = ['draft', 'submitted', 'needs_info', 'rejected', 'accepted', 'in_progress', 'on_hold', 'closed'];
export const REVIEW_DECISIONS = {accept: 'accepted', reject: 'rejected', request_info: 'needs_info'};

export function assertAccess(user, item) {
  if (!user || !item) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'creditor') return String(user.organizationId) === String(item.organizationId);
  if (user.role === 'operator') return String(user._id) === String(item.assignedTo || '');
  return false;
}

export function canEditDraft(role, status) {
  return role === 'creditor' && (status === 'draft' || status === 'needs_info');
}

export function canSubmit(status) { return status === 'draft' || status === 'needs_info'; }
export function canReview(status) { return status === 'submitted'; }
export function canAssign(status) { return status === 'accepted' || status === 'in_progress'; }

export function calculateMoney(principalPaise, feeRateBps, receipts = []) {
  if (!Number.isSafeInteger(principalPaise) || principalPaise < 0) throw new Error('Invalid principal');
  if (!Number.isInteger(feeRateBps) || feeRateBps < 0 || feeRateBps > 10000) throw new Error('Invalid fee rate');
  let recoveredPaise = 0;
  for (const r of receipts) {
    if (r.status !== 'verified') continue;
    if (!Number.isSafeInteger(r.amountPaise)) throw new Error('Invalid receipt amount');
    recoveredPaise += r.kind === 'reversal' ? -r.amountPaise : r.amountPaise;
  }
  if (!Number.isSafeInteger(recoveredPaise) || recoveredPaise < 0 || recoveredPaise > principalPaise) throw new Error('Invalid recovery total');
  // Half-up to the nearest paisa; avoid floating point using integer math.
  const feePaise = Number((BigInt(recoveredPaise) * BigInt(feeRateBps) + 5000n) / 10000n);
  return {recoveredPaise, outstandingPaise: principalPaise - recoveredPaise, feePaise};
}

export function formatCaseCode(id) { return `CC-${String(id).toUpperCase()}`; }
