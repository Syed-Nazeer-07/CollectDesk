# CollectDesk

**Commercial collections case management · hosted internship MVP demo**

CollectDesk is a role-based case-management prototype built for a commercial collections project. Creditors submit fictional overdue invoices; administrators review and assign cases; operators record progress; and finance totals reflect verified test receipts rather than promises to pay.

> **Demo only.** CollectDesk handles no real collection communications, customer documents, bank transfers, or payments. The illustrated fee rate is not an approved commercial pricing policy.

## Live preview

**[Open CollectDesk](https://collectdesk-preview-ah80.onrender.com/login)** · [Check API and database health](https://collectdesk-preview-ah80.onrender.com/api/health)

Render hosts Next.js and Express together in one Docker container; MongoDB Atlas stores fictional demo records. The free Render service sleeps after inactivity. A first request may take considerably longer than subsequent requests, and the service can restart at any time. The current free hosting plan is **not** intended for a time-critical demonstration or production usage.

| Demo role | Email | Purpose |
| --- | --- | --- |
| Creditor | `creditor@demo.collectdesk.test` | Create and submit fictional invoices; see public progress |
| Administrator | `admin@demo.collectdesk.test` | Review, assign, hold/resume/close cases; verify and correct demo receipts |
| Case operator | `operator@demo.collectdesk.test` | Update assigned cases; create internal or creditor-visible notes |
| Second creditor | `creditor2@demo.collectdesk.test` | Validate cross-organization isolation |

All accounts use the **private demo password** stored in Render's `DEMO_SEED_PASSWORD`. It is not the Atlas account password. Never commit or share credentials.

## Optional account registration (new)

CollectDesk now includes **email/password registration with verified email links**, **Google Sign-In**, and **new-company onboarding** for creditor accounts. These are intentionally **disabled by default on the public demo** until the necessary external email/Google provider settings have been configured and approved. Existing seeded demo logins remain unaffected.

Public signup never grants Administrator or Operator privileges. Google ID tokens are verified server-side, and new companies cannot access existing creditors' records.

**[Authentication setup and security constraints](docs/AUTH_SETUP.md)** explains the Render environment variables, verified sending domain and Google client configuration. Do not describe the public registration flows as enabled until the live provider tests pass.

## Implemented workflows

- **Cases:** create/edit drafts, overdue-only submission, request information, accept/reject reviews, assignment, status changes (hold, resume, close) with documented reasons.
- **Activity:** timeline updates with public vs internal visibility; creditors can see only their own organization's cases.
- **Finance:** record, reject or verify pending fictional receipts; reverse erroneous verified receipts with a separate correction entry; track outstanding principal and illustrative fees in integer paise.
- **Workspace:** searchable, filterable, paginated case register; role-aware dashboard; explicit navigation and mobile case cards.
- **Safety:** cookie-based authentication, role/tenant checks, input validation, origin checks, rate limiting, and best-effort serialized demo ledger updates.

Case closure does **not** imply full financial recovery. Pending test receipts must be reconciled before closing. Reversal and status decisions are recorded in the activity timeline.

## Architecture

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, TypeScript |
| Backend | Express 5 on Node.js 22, Zod validation |
| Database | MongoDB Atlas/Mongoose |
| Authentication | bcrypt passwords, signed httpOnly cookies |
| Hosting | Render Docker preview, one web service |
| CI | GitHub Actions, MongoDB integration tests, Chromium browser tests, external HTTPS checks |

The browser accesses `/api/v1/*` on the same origin. Next.js proxies those requests to an internal Express process; MongoDB is never exposed through the public web service. `/api/health` reports HTTP 200 only when the API and database are ready.

## Run locally (Docker Compose)

Requires Node.js/npm and Docker Desktop with Linux containers.

```powershell
Copy-Item .env.compose.example .env.compose
# Edit .env.compose locally: strong JWT_SECRET (32+ chars)
# and a distinct DEMO_SEED_PASSWORD (12+ chars).
docker compose --env-file .env.compose build
docker compose --env-file .env.compose --profile seed run --rm seed
docker compose --env-file .env.compose up -d database api web
```

Visit **http://localhost:3000/login**. The fictional demo database persists across normal container restarts. Running `docker compose down -v` deletes local data.

To test local services:

```powershell
$env:SMOKE_EMAIL = 'admin@demo.collectdesk.test'
$env:SMOKE_PASSWORD = 'YOUR_LOCAL_DEMO_SEED_PASSWORD'
npm run smoke
Remove-Item Env:SMOKE_EMAIL
Remove-Item Env:SMOKE_PASSWORD
```

For the browser audit, install Chromium with `npx playwright install chromium` and run `npm run audit:browser` with `DEMO_SEED_PASSWORD` available privately in the process environment. The audit **creates fictional records**: run it only against an isolated demo, never production.

Manual Node startup and non-Docker environment examples are retained in `apps/api/.env.example`, `apps/web/.env.example`, and `package.json`.

## Verification

As of **8 November 2026**:

- GitHub Actions runs TypeScript checks, unit/API integration tests against disposable MongoDB, a Next.js build, a Render-container smoke test, and multi-role Chromium browser flows.
- The browser audit verifies tenant isolation, creditor/internal note visibility, invoice lifecycle, verification, corrections, and responsive layout.
- External HTTPS diagnostics check live public health, login page delivery, unauthenticated session protection and invalid-password rejection.
- The user previously reported **9/9 local authenticated smoke checks passing**.
- **Not independently established:** a real-password browser login against the hosted preview, uptime after long idle periods, security penetration testing, real-world operational load or disaster recovery.

Recent workflow runs: **[GitHub Actions](https://github.com/Syed-Nazeer-07/CollectDesk/actions)**. Current status and limitations: **[Implementation status](docs/IMPLEMENTATION_STATUS.md)**.

## Deployment and rollback

- The tracked `render.yaml` and `Dockerfile.render` configure a **free demo preview**; `scripts/start-hosted.mjs` starts the app servers.
- The existing Render service is `collectdesk-preview-ah80`. Set `MONGODB_URI`, `JWT_SECRET` and `DEMO_SEED_PASSWORD` privately in its **Environment** page. `SEED_DEMO_ON_START=false` avoids resetting demo users on wake-up.
- See **[Render & Atlas deployment guide](docs/RENDER_DEPLOYMENT.md)** for initial provisioning and troubleshooting.
- A pre-hardening rollback branch exists at `rollback/pre-final-hardening-2026-11-08`. GitHub releases and Render deploy history can provide additional recovery points.

## Security and production limits

Do **not** upload real invoices, bank details, personally identifiable debtor records or financial evidence. The evidence field is currently a **filename label**, not a stored file.

This is not a production-ready financial ledger: financial updates use a temporary per-case lease rather than multi-document transactions; events and ledger writes are not crash-atomic. A real deployment needs hardened identity (including MFA/password recovery), robust document storage and scanning, financial reconciliation, backups, alerting, and independent legal/security reviews.

The dedicated Atlas demo currently has a broad IP access rule to support the Render preview. Restrict it to Render's actual outbound CIDR ranges before any real use; see [Render outbound IP addresses](https://render.com/docs/outbound-ip-addresses). Strong dedicated database credentials and database-specific roles are necessary but do not replace network restrictions.

## Project references

- [Original product requirements](docs/Commercial_Collections_PRD_v0.1.pdf)
- [Competitor research](docs/Commercial_Collections_Competitor_Research_Enhanced.pdf)
- [Demo walkthrough](docs/DEMO_SCRIPT.md)
- [Changelog](docs/CHANGELOG.md)

All seeded organizations, invoices, receipts, and activity records are fictional.
