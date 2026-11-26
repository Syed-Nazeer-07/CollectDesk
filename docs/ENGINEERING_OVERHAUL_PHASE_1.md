# Engineering overhaul: phase 1

This change preserves the fictional-data MVP and its existing role model. It is not a production launch or a compliance certification.

## Changes

- Exact BigInt receipt accumulation with positive safe integer validation and explicit receipt kind checks; existing integer-paise API contract retained.
- Integer validation at model boundaries, and checked additions for portfolio totals and pending receipts.
- Receipt activity metadata now identifies the affected receipt/reversal and decision, without exposing references in the activity response.
- Scoped dashboard aging uses the Indian business day and verified net balances. It includes only accepted, in-progress or held unpaid cases. Closed, draft, submitted, rejected and information-requested cases are intentionally excluded. The priority list is limited to five cases and ranks by age, outstanding amount and case ID, not predictive risk.
- Dashboard recent rows include missing due/created dates. Existing dashboard fields and role permissions remain unchanged.

## Open release blockers

The current lease is not a multi-document transaction: a financial write and its activity entry can still diverge, and a lease can expire during work. A transactional ledger and audit/outbox design with replica-set migration, concurrency tests, failure injection, reconciliation and recovery are prerequisites for real financial records. The existing global administrator / assigned operator trust model must be reviewed against any future per-tenant administrator requirements; changing this requires an explicit data and permission migration. Real debtor data, production evidence and automated debtor outreach remain out of scope.

The dashboard is an initial operational improvement, not a complete UI overhaul. Verify typecheck, API integration, browser layout at all breakpoints and hosted container via the existing PR CI. No deployment or main-branch change is required for this review.
