# CollectDesk

**Commercial Collections · MVP v0.3 (development preview)**

A simple, responsive B2B invoice recovery **case-management demo** for the Ricoz Innovation project. Built from the competitor research and proposed PRD of 8 November 2026. All seeded business names and invoices are fictional.

> **Prototype, not a debt-collection service.** It does not process payments, send collection communications, or provide legal advice. The 15–30% fee range is illustrative and not an approved commercial price.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16.4.5+ App Router, React 19, TypeScript |
| Backend | Node.js 22.23.4+ LTS or 24.22.1+ LTS, Express 5 |
| Database | MongoDB + Mongoose |
| Auth | bcrypt password hashing, signed httpOnly session cookie |
| API protection | Strict input schemas, origin check, rate limiting, case-level access checks |

Next.js proxies browser `/api/v1/*` traffic to Express, keeping cookies same-origin. Express connects to MongoDB via a **server-only** connection string.

## Simplified local demo with Docker Compose (optional)

If Docker Desktop with Linux containers is available on your computer, Compose can start **MongoDB, Express and Next.js** together. This configuration is **unverified here** because Docker and npm downloads are unavailable in the authoring environment. It is for **localhost and fake data only**; MongoDB stays on the internal container network.

```powershell
Copy-Item .env.compose.example .env.compose
# Edit .env.compose: provide a unique JWT_SECRET (32+ characters)
# and a unique DEMO_SEED_PASSWORD (12+ characters).
# Example secure JWT secret generator (paste result into .env.compose):
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

docker compose --env-file .env.compose build
docker compose --env-file .env.compose --profile seed run --rm seed
docker compose --env-file .env.compose up -d database api web
node scripts/smoke.mjs
```

Open **http://localhost:3000**. The demo password is the value you set in `.env.compose`. When finished, run `docker compose --env-file .env.compose down` to stop services without deleting the demo database. Be careful: `down -v` **erases the local demo database**. Never store actual customer information in this prototype.

### Read-only full-stack smoke check

After either startup method is running, this checker validates the Express health endpoint, MongoDB state, Next login page, and unauthenticated API proxy. To also test login, session cookies, dashboard and case pagination, set **both** credentials:

```powershell
$env:SMOKE_EMAIL = 'admin@demo.collectdesk.test'
$env:SMOKE_PASSWORD = 'YOUR_CONFIGURED_DEMO_PASSWORD'
npm run smoke
```

The smoke test makes **no changes** to cases or receipts. The heavier API integration suite runs independently against a specially named disposable test database and clears that database. The GitHub Actions workflow now includes a production frontend build and a read-only cross-service smoke step (when pushed and run).

## Running locally (Windows PowerShell)

**Prerequisites:** Patched Node.js 22 LTS (22.23.4+) or 24 LTS (24.22.1+), npm, and a local MongoDB database or a MongoDB Atlas development database. No paid AI API key is needed. The updated project has **not** been installed or run end-to-end in the authoring environment because the npm registry is unreachable here. GitHub Actions has passed its configured typecheck, unit/integration-test, production-build and smoke-test stages. The user also reported a successful local Docker Compose startup and all nine authenticated smoke checks passing on 8 November 2026. A manual multi-role browser audit and production deployment are still pending.

```powershell
# Unzip the archive, then open the project folder
cd commercial-collections-mvp

Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local

# Edit apps/api/.env:
#  - MONGODB_URI: your local MongoDB URI or private MongoDB Atlas connection
#  - JWT_SECRET: new random secret >= 32 characters
#  - DEMO_SEED_PASSWORD: a unique password >= 12 characters
# Do not commit the .env files.

npm install
npm run seed
npm run dev
```

Open **http://localhost:3000** and enter the `DEMO_SEED_PASSWORD` you configured.

| Demo role | Email |
| --- | --- |
| Creditor (company A) | `creditor@demo.collectdesk.test` |
| Creditor (company B) | `creditor2@demo.collectdesk.test` |
| Administrator | `admin@demo.collectdesk.test` |
| Case operator | `operator@demo.collectdesk.test` |

All demo accounts share the **development-only** password configured in `DEMO_SEED_PASSWORD`. Never reuse it in a production database. Run the seed script against **a dedicated throwaway database** only. The seed may reset passwords on existing demo users.

The UI runs at port **3000**. Express runs on port **4000**. Health endpoint: `http://localhost:4000/health` (returns `database: connected` only when MongoDB is connected).

## Browser audit (Chromium)

The GitHub Actions workflow installs Chromium and runs `npm run audit:browser` against the live CI demo after smoke testing. The audit logs in as separate creditor, admin and operator accounts; creates a **fictional** invoice; reviews and assigns it; checks internal-note and organization isolation; verifies a test receipt; and exercises mobile navigation. Screenshots are uploaded as the `collectdesk-browser-audit` Actions artifact. This is test automation, not a substitute for a security assessment or human accessibility/visual review.

To run against your **own local demo**, start Docker Compose and seed its dedicated demo database, then (outside Docker, with Node/npm installed) run:

```powershell
npm install
npx playwright install chromium
$env:DEMO_SEED_PASSWORD = (Get-Content .env.compose | Where-Object { $_ -match '^DEMO_SEED_PASSWORD=' } | Select-Object -First 1) -replace '^DEMO_SEED_PASSWORD=', ''
npm run audit:browser
Remove-Item Env:DEMO_SEED_PASSWORD
```

This creates synthetic records in the local demo database. Do not point it at a production deployment, and don't publish its screenshots if they ever contain real customer information.

## Hosted demo (Render + MongoDB Atlas)

The repository now includes a **free-tier Render preview Blueprint** (`render.yaml`) and a dedicated single-container image (`Dockerfile.render`) that starts both the Next.js frontend and Express API. This **does not** deploy MongoDB; use a separate, isolated Atlas demo cluster. The deployed URL is only available once the Render service and its secret database configuration have been created.

- Full setup and security guidance: **[Render deployment guide](docs/RENDER_DEPLOYMENT.md)**
- Hosted readiness check: `/api/health` (HTTP 200 only if MongoDB and the API are reachable)
- A publicly accessible demo must contain **fictional** records only; do not confuse this with a private production service.
- The existing local Docker Compose stack remains unchanged and continues using `Dockerfile`.

## Current user journey

1. Sign in as a **creditor** → open **New case** → enter a fictional overdue B2B invoice → save draft or submit.
2. Sign in as **administrator** → open submitted case → accept, reject or request information with a reason.
3. For an accepted case, admin assigns an **operator**. The operator sees only assigned cases.
4. Operator posts a case update, optionally internal-only. Creditor sees only creditor-visible activities.
5. Admin records a *pending* fictional receipt. Only the separate **Verify** action includes it in recovered totals and the fee estimate.

## Important financial rule

Use **integer paise**. Recovered = verified receipts − approved reversal entries. Pending receipts never count as cash received. Unverified receipt references are not exposed to creditor accounts. Estimated fee = round-half-up(net recovery × fee basis points ÷ 10,000). Fees are an estimate and exclude taxes, discounts and legal expenses.

## Scripts

```bash
npm run dev                 # Express and Next.js in parallel
npm run seed                # Create / upsert fictional demo data
npm run test                # Pure domain-rule tests (Node's built-in test runner)
npm run build               # Production Next.js build
npm run check               # Unit tests + Next.js build
```

The domain-rule tests do not need npm dependencies, but a full build and API integration tests do. The v0.3 API also provides server-side case search, status filtering, 25-item paging, and overdue-only submission for the India demo market.

### API integration suite (requires a disposable database)

The new integration test covers role-based login, cross-organization isolation, invoice submission,
admin reviews, operator updates, creditor-visible vs internal notes, pending/verified receipts,
reversals, and competing verification requests. It is **skipped** unless `TEST_MONGODB_URI` is provided.

```powershell
# Use an isolated disposable MongoDB database. THIS DATABASE IS CLEARED by the test.
$env:TEST_MONGODB_URI = "mongodb://127.0.0.1:27017/collectdesk_integration_test"
npm install
npm test
```

Only the exact database names `collectdesk_integration_test` or `collectdesk_ci_test` are accepted
for this destructive integration test. **Never** point it to live or personal data.

GitHub Actions configuration is included in `.github/workflows/ci.yml` and will run
TypeScript checks, unit + MongoDB integration tests, and the Next.js production build
when pushed to a repository with Actions enabled. GitHub Actions passed its configured checks after the MongoDB runner and TypeScript fixes; review the most recent run before relying on that result.


## Source tree

```
apps/
  web/     Next.js App Router frontend (TypeScript)
  api/     Express REST API + Mongoose models + seed + tests
      src/ app.js, auth.js, models.js, rules.js, server.js, seed.js
      test/rules.test.js
docs/
  visual-preview.html       Static visual mockup, NOT an application
  IMPLEMENTATION_STATUS.md  Implemented, unverified, and deferred items
  Commercial_Collections_PRD_v0.1.pdf
  Commercial_Collections_Competitor_Research_Enhanced.pdf
```

## Security boundaries & limitations

- No public registration; accounts are seeded for demo purposes.
- Creditor's `organizationId` comes from authenticated session rather than the request body.
- Activity visibility is filtered server-side; operators may access only assigned cases.
- API requires a matching frontend Origin for state-changing requests. Configure `WEB_ORIGIN` exactly (including protocol) to match your frontend.
- Use a same-origin Next.js API proxy when deploying; the API should not be directly exposed to untrusted public traffic without additional hardening.
- The per-case financial mutation lease serializes ordinary simultaneous demo requests; it is **not** an ACID transaction, and operations spanning receipts + audit events are not crash-atomic. Use replica-set transactions and reconciliation before real financial use.
- The filename label is *not* a stored evidence file. Implement private object storage, malware scanning and authorized download only after scope approval.
- GitHub Actions has passed the configured DB-backed integration and build checks, and local Docker smoke tests passed per the user-provided terminal logs. Comprehensive browser E2E/security testing and production deployment are still pending. Production use would require operational, legal and security review.
- Source code and rollback tags are now pushed to the private GitHub repository `Syed-Nazeer-07/CollectDesk`. There is no public live deployment yet.

See `docs/IMPLEMENTATION_STATUS.md` for the accurate implementation and test status.
