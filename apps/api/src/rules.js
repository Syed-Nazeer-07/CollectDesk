/** Pure domain rules, testable without a database. Amounts are INTEGER paise. */
export const ROLES = ['creditor', 'operator', 'admin'];
export const CASE_STATUSES = ['draft', 'submitted', 'needs_info', 'rejected', 'accepted', 'in_progress', 'on_hold', 'closed'];
export const REVIEW_DECISIONS = {accept: 'accepted', reject: 'rejected', request_info: 'needs_info'};

export function assertAccess(user, item) {
  if (!user || !item) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'creditor') return Boolean(user.organizationId && item.organizationId) && String(user.organizationId) === String(item.organizationId);
  if (user.role === 'operator') return Boolean(user._id && item.assignedTo) && String(user._id) === String(item.assignedTo);
  return false;
}

export function canEditDraft(role, status) {
  return role === 'creditor' && (status === 'draft' || status === 'needs_info');
}

export function canSubmit(status) { return status === 'draft' || status === 'needs_info'; }
export function canReview(status) { return status === 'submitted'; }
export function canAssign(status) { return status === 'accepted' || status === 'in_progress'; }
/** Admin-only operational transitions; closed is deliberately terminal in this demo. */
export function canHold(status) { return status === 'accepted' || status === 'in_progress'; }
export function canResume(status) { return status === 'on_hold'; }
export function canClose(status) { return ['accepted','in_progress','on_hold'].includes(status); }

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

/** Date key in the demo market's local timezone, independent of server locale. */
export function indiaDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** A case is overdue only if its due date precedes today's Indian business date. */
export function isOverdue(dueDate, now = new Date()) {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.toISOString().slice(0, 10) < indiaDateKey(now);
}

/** Stable, user-visible page metadata; avoid negative/empty totals. */
export function pageInfo(page, pageSize, total) {
  return {page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize))};
}

/** Safe query scope for every role, including malformed/legacy user accounts. */
export function scopeForUser(user) {
  if (user?.role === 'admin') return {};
  if (user?.role === 'creditor') return user.organizationId ? {organizationId: user.organizationId} : {organizationId: {$exists: false}};
  if (user?.role === 'operator') return user._id ? {assignedTo: user._id} : {assignedTo: {$exists: false}};
  return {_id: {$exists: false}};
}
