# Implementation status · CollectDesk v0.3

**Status:** Working source-code prototype; **not yet verified end-to-end against a running MongoDB and Next.js build**.

## Implemented in source

- Next.js App Router web UI: login, overview, case list, case creation, case detail, actions, responsive styling.
- Express REST API with cookie-based sign-in, per-organization creditor isolation and operator assignment scope.
- MongoDB/Mongoose schemas for users, organizations, cases, activities and receipts.
- Seed script with two synthetic organizations and three role types.
- Creditor: create/update draft, submit claim, view timeline, basic financial overview.
- Admin: review (accept/reject/needs info), assign operators, create notes, record/verify receipts.
- Operator: view assigned cases and add permissioned notes.
- Pure domain math rules: integer paise; verified recovery only; reversals; fees.
- Cross-origin request check, password hashing, httpOnly cookie, rate limiting, generic auth errors, input validation.
- Creditor API now hides unverified internal receipt records; staff still see pending entries.
- Demo ledger mutations serialized by short-lived per-case MongoDB lease (not a transaction).
- Draft-creation UI handles a failed second-step submission without claiming the draft disappeared.
- UI distinguishes completed action from subsequent refresh failure, reducing accidental duplicate submissions.
- Automated unit tests and an opt-in MongoDB-backed API integration suite.
- Local Git history and rollback tag; GitHub Actions CI configuration.
- Server-side case search with pagination (25 items/page) and validation of filter inputs.
- Creditors can save future-dated invoice drafts but submit only overdue invoices (Indian business date).
- Tenant query scope fails closed for malformed accounts without a valid organization/actor ID.
- Read-only full-stack smoke script and optional Docker Compose setup for MongoDB, API and frontend (not executed here).

## Test evidence

- **19 passing unit tests** from `node --test`, independently executable without npm packages.
- **1 skipped API integration test**, containing many assertions; requires dependencies + disposable MongoDB to execute.
- JavaScript syntax checks: passing. TypeScript/TSX parse checks: separate report.
- No successful `npm install`, TypeScript typecheck, Next.js build, live-stack smoke or browser E2E execution in this environment. Docker Compose was parsed as valid YAML but not launched.
- GitHub Actions workflow is prepared but **has not been executed**.

## Security limitations requiring follow-up

- Financial lease uses a 120-second timeout, not atomic multi-document transactions. Process crashes, partial failures, or a request exceeding its lease can leave an inconsistent audit trail; a production service must use MongoDB replica-set transactions and reconciliation.
- `Case` updates and audit logs are separate writes. Partial failures can persist a case change even if the request eventually reports an error. Do not use this for real collection or money tracking.
- No public account registration, password reset, MFA, immutable audit store, file storage/scanning, debtor messaging, money movement, real recovery verification, legal notices or external integrations.
- No independent penetration test, legal compliance review, production backup/recovery plan, or deployment.
- No formal browser visual checks of the real running app.
- **45% completion is an unapproved milestone proposed by the PRD, not a calculated or accepted percentage.**

## Next checks to run when npm and MongoDB are available

1. Upgrade to patched Node.js LTS; install dependencies with `npm install`.
2. Run API unit + integration tests against `collectdesk_integration_test` (destructive test database).
3. Run `npm run typecheck -w @collectdesk/web` and `npm run build`.
4. Seed a **different, throwaway** demo database and run the two servers (or use the optional Docker Compose workflow).
5. Run `npm run smoke` with both `SMOKE_EMAIL` and `SMOKE_PASSWORD`, then capture results.
6. Execute the role-by-role checklist in `docs/DEMO_SCRIPT.md` using the browser.
7. Fix issues surfaced in those runs, then decide repository ownership and deployment.

Do not submit this as a production-ready collections platform.
