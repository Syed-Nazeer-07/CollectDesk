# Changelog

## v0.2 — Development verification and safeguards (8 November 2026)

- Retained v0.1 source as an explicit local Git rollback point.
- Restricted unverified receipt details to staff; creditors receive only verified ledger entries.
- Display fractional rupees precisely in financial detail views.
- Added a short-lived MongoDB lease around record/verify/reverse receipt operations to serialize normal concurrent requests in the demo. **Not production-grade transactionality.**
- Clarified partial-success messages when a draft is created but automatic submission fails, and when an update succeeds but refresh fails.
- Added optional real-MongoDB API integration tests covering tenant authorization and the case lifecycle, including concurrent verification attempts.
- Added GitHub Actions build/test workflow and updated setup/security guidance.

## v0.1 — Initial implementation (8 November 2026)

- Next.js + Express + MongoDB source prototype.
- Account roles, demo data, invoice creation, case reviews, assignment, notes and recorded/verified receipts.
- 16 dependency-free domain-rule tests.
