# CollectDesk

**Commercial Collections · MVP v0.1**

A simple, responsive B2B invoice recovery **case-management demo** for the Ricoz Innovation project. Built from the competitor research and proposed PRD of 8 November 2026. All seeded business names and invoices are fictional.

> **Prototype, not a debt-collection service.** It does not process payments, send collection communications, or provide legal advice. The 15–30% fee range is illustrative and not an approved commercial price.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, TypeScript |
| Backend | Node.js 22+, Express 5 |
| Database | MongoDB + Mongoose |
| Auth | bcrypt password hashing, signed httpOnly session cookie |
| API protection | Strict input schemas, origin check, rate limiting, case-level access checks |

Next.js proxies browser `/api/v1/*` traffic to Express, keeping cookies same-origin. Express connects to MongoDB via a **server-only** connection string.

## Running locally (Windows PowerShell)

**Prerequisites:** Node.js 22+, npm, and a local MongoDB database or a MongoDB Atlas development database. No paid AI API key is needed. This project has **not** been installed or run end-to-end in the authoring environment because the npm registry was unreachable there.

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

## Current user journey

1. Sign in as a **creditor** → open **New case** → enter a fictional overdue B2B invoice → save draft or submit.
2. Sign in as **administrator** → open submitted case → accept, reject or request information with a reason.
3. For an accepted case, admin assigns an **operator**. The operator sees only assigned cases.
4. Operator posts a case update, optionally internal-only. Creditor sees only creditor-visible activities.
5. Admin records a *pending* fictional receipt. Only the separate **Verify** action includes it in recovered totals and the fee estimate.

## Important financial rule

Use **integer paise**. Recovered = verified receipts − approved reversal entries. Pending receipts never count as cash received. Estimated fee = round-half-up(net recovery × fee basis points ÷ 10,000). Fees are an estimate and exclude taxes, discounts and legal expenses.

## Scripts

```bash
npm run dev                 # Express and Next.js in parallel
npm run seed                # Create / upsert fictional demo data
npm run test                # Pure domain-rule tests (Node's built-in test runner)
npm run build               # Production Next.js build
npm run check               # Unit tests + Next.js build
```

The test runner does not need npm dependencies for pure rule tests, but a full build and API tests do.

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
- The filename label is *not* a stored evidence file. Implement private object storage, malware scanning and authorized download only after scope approval.
- Login, endpoint, database and browser integration tests are not yet run. Production deployment would require operational, legal and security review.
- For updates, use feature branches, make focused commits and keep rollback tags. **No commits or GitHub pushes are included in this archive.**

See `docs/IMPLEMENTATION_STATUS.md` for the accurate implementation and test status.
