<div align="center">

# CollectDesk

### A clearer workspace for commercial collections

Manage overdue cases, coordinate teams, and track verified recoveries — all in one role-based workspace.

[Live application](https://collectdesk.onrender.com/) · [Sign in](https://collectdesk.onrender.com/login) · [Source code](https://github.com/Syed-Nazeer-07/CollectDesk) · [CI](https://github.com/Syed-Nazeer-07/CollectDesk/actions)

**Next.js · React · TypeScript · Node.js · Express · MongoDB**

</div>

> [!NOTE]
> **Technical-evaluation MVP using fictional data.** CollectDesk is not a payment processor or a live debt-collection service. Do not upload real invoices, debtor information, or financial records. The hosted service may take time to wake up on Render's free tier; availability and configured sign-in providers should be verified before a demo.

## Overview

CollectDesk brings the commercial collections workflow into one organized application. Creditors submit overdue cases, administrators review and assign them, and operators record progress. Recovery totals are based on verified demonstration receipts rather than unconfirmed claims.

### Highlights

- **Role-based workspaces** — distinct creditor, administrator, and case-operator permissions.
- **Case lifecycle** — draft, submit, review, assign, progress, reconcile, and close cases.
- **Recovery reporting** — outstanding balances, verified recoveries, illustrative fees, and activity history.
- **Organization isolation** — creditor records are scoped to their respective organizations.
- **Account onboarding** — company setup and a progress-aware getting-started checklist.
- **Support tickets** — authenticated users submit requests; administrators manage resolutions.
- **Staff access** — administrator-issued, expiring operator invitations when transactional email is configured.
- **Optional identity flows** — Google sign-in, verified email registration, and password recovery when the required providers are configured.
- **Synthetic PDF evidence** — optional private sample attachments behind an explicit feature flag; not approved for real financial documents.

## How it works

```text
Creditor creates a draft
          ↓
Submits an overdue case
          ↓
Administrator reviews and assigns
          ↓
Operator records collection activity
          ↓
Administrator verifies sample receipts
          ↓
Case is reconciled and closed
```

Pending receipts do not count as recovered funds. Reversals are recorded separately, and a closed case does not necessarily mean the full balance was recovered.

## Technology

| Area | Technologies |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Lucide |
| Backend | Node.js 22, Express 5, Zod |
| Database | MongoDB, Mongoose |
| Authentication | Signed HTTP-only cookies, bcrypt, optional Google OAuth and verified email |
| Infrastructure | Docker Compose for local development, Render for hosting |
| Quality | Node.js API tests, Playwright browser audit, GitHub Actions |

## Repository structure

```text
CollectDesk/
├── apps/
│   ├── web/             # Next.js application
│   └── api/             # Express API and tests
├── docs/                # Product research and release documentation
├── scripts/             # Seed, smoke test and hosting utilities
├── compose.yaml         # Local MongoDB, API and web services
├── Dockerfile.render    # Hosted container build
└── package.json         # npm workspace scripts
```

## Run locally

**Requirements:** Docker Desktop (Linux containers) and Node.js/npm.

1. Clone the repository and enter the project directory.
2. Create a local environment file from the example:

```powershell
Copy-Item .env.compose.example .env.compose
```

3. In `.env.compose`, set a unique `JWT_SECRET` (at least 32 characters) and `DEMO_SEED_PASSWORD` (at least 12 characters). Never commit secrets.
4. Build, seed fictional reviewer accounts, and start the services:

```powershell
docker compose --env-file .env.compose build
docker compose --env-file .env.compose --profile seed run --rm seed
docker compose --env-file .env.compose up -d database api web
```

Open **http://localhost:3000**. The API is available locally on port **4000**.

The seeded reviewer roles are administrator, creditor, and case operator. Their passwords come from your private `DEMO_SEED_PASSWORD` setting; no public credentials are supplied.

### Checks

```bash
npm test
npm run build
```

For additional checks, see the repository scripts and [GitHub Actions](https://github.com/Syed-Nazeer-07/CollectDesk/actions). Browser audits create fictional records and must never target a production database.

## Deployment and configuration

The hosted deployment uses `Dockerfile.render` and `node scripts/start-hosted.mjs`. Configure `MONGODB_URI`, `JWT_SECRET`, and `WEB_ORIGIN` as private environment variables. Set the web origin to the actual HTTPS deployment URL.

Public creditor registration is opt-in through `PUBLIC_REGISTRATION_ENABLED=true` and requires a configured identity provider:

- **Google:** `GOOGLE_CLIENT_ID` and the correct authorized HTTPS JavaScript origin.
- **Verified email:** Resend (`RESEND_API_KEY`, `AUTH_FROM_EMAIL`) or Brevo (`BREVO_API_KEY`, `BREVO_FROM_EMAIL`) with an approved sender.
- **Local SMTP:** Gmail SMTP can be configured on SMTP-capable hosts, but Render Free restricts outbound SMTP ports.

Operator invitations and password recovery require a working email sender. Public registration never grants administrator or operator privileges. Do not put tokens, SMTP passwords, database URLs, or reviewer passwords in source control.

## Documentation

- [Product requirements](docs/Commercial_Collections_PRD_v0.1.pdf)
- [Competitor research](docs/Commercial_Collections_Competitor_Research_Enhanced.pdf)
- [Implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md)
- [Release readiness and QA](docs/RELEASE_READINESS.md)

## Current scope

CollectDesk is a **demonstration application**, not a production collections platform. It does not transfer money, contact debtors, or establish business identity. Optional sample PDFs are stored privately but do not have production-grade malware scanning, retention controls, or compliance approval. A real deployment would require legal and privacy review, hardened evidence handling, monitored infrastructure, tested backups, and end-to-end acceptance testing.

---

<div align="center">

Built by [Syed Nazeer](https://github.com/Syed-Nazeer-07) · **CollectDesk © 2026**

</div>
