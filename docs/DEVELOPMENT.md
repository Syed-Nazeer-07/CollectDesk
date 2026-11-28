# Development and deployment

Use fictional data exclusively. Keep local fixtures and hosted databases separate.

## Prerequisites

- Docker Desktop with Linux containers for the recommended Compose setup.
- Node.js 22.23.4 for local npm commands (see `../.nvmrc`).
- Git and npm. The repository uses npm workspaces.

## Docker Compose

From the repository root:

```bash
cp .env.compose.example .env.compose
```

On PowerShell use `Copy-Item .env.compose.example .env.compose`.

Set `JWT_SECRET` (32+ characters) and `DEMO_SEED_PASSWORD` (12+ characters). Never commit the private configuration.

```bash
docker compose --env-file .env.compose build
docker compose --env-file .env.compose --profile seed run --rm seed
docker compose --env-file .env.compose up -d database api web
```

Web: http://localhost:3000. API: http://localhost:4000. The replica-set database is internal to Compose.

| Fictional account | Role |
| --- | --- |
| creditor@demo.collectdesk.test | Creditor |
| creditor2@demo.collectdesk.test | Separate creditor organization |
| operator@demo.collectdesk.test | Operator |
| admin@demo.collectdesk.test | Administrator |

Passwords are your private local `DEMO_SEED_PASSWORD`. These are not hosted credentials. The seed command resets fictional accounts; never use it against live or real-data storage.

Stop services with `docker compose --env-file .env.compose down`. The named database volume persists by default.

## Local development

Install dependencies using `npm ci`. Configure the API from [apps/api/.env.example](../apps/api/.env.example) and the web proxy from [apps/web/.env.example](../apps/web/.env.example).

For an ephemeral local demo with no external database, the repository also includes `node scripts/dev-local.mjs`, which launches an in-memory replica set, seeds fictional data and starts both dev processes. This launcher is development-only and uses a fixed local fixture password; do not use it on a public host.

With a configured replica set and private local environment, `npm run dev` starts both workspaces. Standalone MongoDB is not supported.

## Tests

```bash
npm ci
npm run typecheck -w @collectdesk/web
npm test
npm run build
```

Full API integration requires `TEST_MONGODB_URI` pointing to a disposable replica-set database named `collectdesk_integration_test` or `collectdesk_ci_test`. The integration harness clears the database. Without this configuration the full integration suite is not exercised.

For browser tests, install Chromium using `npx playwright install chromium`. Start a dedicated seeded fictional test stack on localhost, configure its private fixture password in your shell, then run:

```bash
npm run smoke
npm run audit:browser
node scripts/audit-navigation.mjs
node scripts/audit-layout.mjs
```

These audits can create and mutate records. Never target the public demo or a database containing real information. Results are written to ignored local artifact directories.

## Hosting

The Render preview uses [Dockerfile.render](../Dockerfile.render) and [scripts/start-hosted.mjs](../scripts/start-hosted.mjs). The blueprint specifies automatic deployment after checks pass for runtime-affecting changes. Documentation-only updates intentionally do not restart the service.

| Variable | Purpose |
| --- | --- |
| MONGODB_URI | Dedicated MongoDB replica set or Atlas database |
| JWT_SECRET | Private session-signing secret |
| WEB_ORIGIN | Actual web origin |
| DEMO_SEED_PASSWORD | Private fixture seeding only |
| GOOGLE_CLIENT_ID | Optional Google Identity Services web client |
| PUBLIC_REGISTRATION_ENABLED | Optional creditor registration; requires verified sender |
| SAMPLE_EVIDENCE_ENABLED | Optional synthetic PDF evidence; default off |
| SEPARATE_RECEIPT_APPROVAL | Optional independent administrator approval |

Configure secrets in the host, not Git. For email, use a configured Resend or Brevo sender, or a permitted SMTP environment. Render Free restricts outbound SMTP. See the API environment example for exact provider settings.

Validate the [live health endpoint](https://collectdesk.onrender.com/api/health) and [release metadata](https://collectdesk.onrender.com/api/v1/meta/release). The deployed SHA may remain unchanged after a docs-only commit. Check [CI](https://github.com/Syed-Nazeer-07/CollectDesk/actions) for the last runtime revision. Free hosting can have cold-start delays.

## Contribution workflow

Keep changes focused, use fictional fixtures, and preserve role and transaction tests. Run typecheck, API integration and relevant browser checks before changing runtime behavior. Do not commit local credentials, build outputs, generated test screenshots or database dumps. Report limitations accurately rather than claiming production readiness.
