# Changelog

## Demo hardening — 8 November 2026

- Created rollback branch `rollback/pre-final-hardening-2026-11-08` before final changes.
- Made creditor edits safe against concurrent submission by including editable status in the database write; added tenant and immutable-invoice regression tests.
- Added administrator case transitions: hold, resume and terminal close, with reasons and audit events. Close blocks while receipts are pending.
- Added pending receipt rejection and verified receipt correction controls with explicit reasons, role enforcement and confirmation.
- Added unit, API integration and Chromium browser coverage for new transitions and corrections.
- Updated README, deployment instructions and implementation status to describe the actual hosted demo, testing and free-tier limitations.
- Real-money operations and secure document uploads remain intentionally outside demo scope.

## v0.3 — Pagination, validation, reproducible testing (8 November 2026)

- Fixed the case register only searching the first 100 loaded cases; added backend filtering, stable ordering and 25-item pages.
- Added overdue-date checks at submission and India business-day handling, while allowing future-dated drafts.
- Hardened role scopes for malformed user records that lack an organization or user ID.
- Fixed request header merging and dashboard retry-state cleanup.
- Added read-only full-stack smoke checker and optional local Docker Compose services for Next.js, Express and MongoDB.
- Expanded pure unit tests to 19 passing; MongoDB integration still skipped in this environment.
- Added CI smoke-test step after build and seed. Not yet run on GitHub.



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
