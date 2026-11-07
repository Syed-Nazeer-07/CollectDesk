# Implementation status · CollectDesk v0.1

**Status:** source-code MVP foundation; **not yet verified end-to-end against a running MongoDB and Next.js build**.

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
- Automated unit tests for pure domain rules.

## Incomplete / not proven

- **No successful npm install or complete Next.js build in the authoring environment** (package registry DNS unavailable).
- **No running MongoDB integration tests or browser E2E tests yet.** Source behavior has not been confirmed under real server conditions.
- Evidence field is **filename label only**, not file upload or document storage.
- No automated emails, real debt collection messaging, money processing, legal notices, or third-party integration.
- No settlement/closure or full re-opening workflow yet.
- No formal security penetration testing or compliance sign-off.
- No real deployment, public URL, or GitHub repository/push.
- **45% completion is an unapproved milestone proposed by the PRD, not a calculated or accepted percentage.**

## Demo milestones suggested to Ricoz

1. Install dependencies, connect MongoDB, run seed.
2. Verify role-based login for admin, creditor A/B, and operator.
3. As creditor A: create draft, submit; refresh and confirm persistence.
4. As admin: accept with rationale and assign operator.
5. As operator: post creditor-facing update; creditor sees it.
6. Verify creditor A cannot access creditor B case even with guessed URL.
7. Save screenshots of the above and present to Rajesh for a check-in.

## Security gates before showing real data

- Do not use real customer or debtor data.
- Configure secure HTTPS, private Mongo credentials, a random JWT_SECRET, provider secrets, and enforce role/tenant authorization.
- Run package vulnerability audit, tests, and a legal/privacy review for actual collections.
- Decide repository ownership and hosting arrangements.
