# CollectDesk production foundations

CollectDesk is a B2B workflow platform for creditor organizations and collections operations teams. The public Render deployment and every seeded test environment are limited to fictional data. Real customer onboarding remains gated on the approvals and infrastructure checks below.

## Scope and rollout order

| Priority | Delivered in this branch | Remaining gate |
| --- | --- | --- |
| Financial reliability | Replica-set transactions for receipt recording, verification, rejection, reversal and close/hold/resume. Same-transaction activity and idempotency receipts. | Stage on the target Atlas topology. Inventory historical receipt totals, take a backup and drain all lease-only writers before enabling transactions. |
| Organization management | One organization per creditor account, owner and member access, company profile, owner-issued one-time invitations, member deactivation, operator workload and access changes. | Assign owners to existing organizations after confirming account ownership. Verify Brevo delivery on staging. |
| Operational queues | Admin priorities, internal follow-ups, overdue work indicators, unassigned queue, operator workload and case-level reconciliation CSV. | Due follow-ups and latest support decisions now appear in the authorized activity feed. Email subscriptions and scheduled delivery remain open. |
| Document infrastructure | Private S3 objects with SSE-S3, scanner-first PDF screening, quarantine metadata, scoped download and audit event, category and explicit expiration, repeatable cleanup task. | Deploy private bucket and scanner, verify IAM and malware handling, approve file policy, configure scheduled retention and backup lifecycle. |
| Account continuity | Preserved Google, Brevo and existing sessions. The persistent provider receives updated onboarding and activation results and rechecks immediately after a protected request is rejected. Transaction mode covers token consumption in creditor verification, operator activation and password reset. | Verify Google and mail using authorized accounts in configured staging. |
| Deployment | MongoDB ping readiness and API-first hosted startup, with a bounded failure deadline. | Validate the candidate container and uptime from a deployed staging service before production promotion. |

## Architecture and access

Next.js forwards same-origin API requests to Express. The API checks the signed HttpOnly cookie, active user, session version and role from MongoDB on every protected request. Production cookies are Secure and SameSite=Lax. State changes require the configured origin. The root React session provider caches display state briefly while navigating. The server remains the authorization boundary.

Creditor case access is scoped by organization ID. Owners can rename their own company and manage members and invitations. Members inherit the creditor case workflow within their organization. Operators see only assigned cases and their permitted evidence. Administrators can operate across the organization directory and reconcile cases. Tenant invitations never carry administrator or operator permissions. Deactivating a member or operator increments the session version. Operator assignments are retained for an explicit admin handoff. The operator workload view displays those assignments even after deactivation.

New verified creditor organizations assign the creating account as owner. Legacy users default to member. Before granting ownership to an existing account, verify the company and account with an authorized reviewer. Inspect the existing owners and record the change in the deployment change log. Set `organizationRole` to `owner` using a filter matching the reviewed user ID, the same organization ID, creditor role and active state. Run these checks in the intended environment and stop on a zero or ambiguous match. Cross-company account reassignment and multiple memberships per identity require a separate design.

## API additions

All routes have the `/api/v1` prefix. Mutations use JSON and a matching `Origin` header except for the PDF upload body.

| Route | Authorization and response |
| --- | --- |
| `GET /organization` | Creditor's own profile. The owner receives recent members, invitations and membership activity. |
| `PATCH /organization` | Owner. Body `{name}`. |
| `GET /organizations?page=1` | Administrator. Paged company directory. |
| `POST /organization/invitations` | Owner. Body `{email}`. Requires mail and transactions. Invite links expire in 24 hours and are issued for new creditor accounts. |
| `POST /organization/invitations/:id/revoke` | Owner. Scoped to pending invites in the same company. |
| `POST /organization/members/:id/deactivate` | Owner. Deactivates a non-owner creditor in the same company and invalidates old sessions. |
| `POST /auth/organization-invite/accept` | One-time token, name and password. User creation and invite acceptance commit together. |
| `GET /work-queue?view=followups&page=1` | Assigned staff or administrator. Administrators can request `view=unassigned`. |
| `POST /cases/:id/work-plan` | Assigned operator or administrator. Body `{followUpAt, followUpNote, priority?}`. Set a future ISO timestamp or null. Priority changes require an administrator. |
| `GET /staff/operators?page=1` | Administrator. Active-case counts and access state. |
| `POST /staff/operators/:id/access` | Administrator. Body `{active}`. Access changes invalidate previous cookies. |
| `GET /cases/:id/reconciliation.csv` | Administrator. Up to 5,000 rows with signed effect of verified entries and exact paise totals. |
| `GET /cases/:id/documents` | Existing case authorization. Returns availability, metadata and status. |
| `POST /cases/:id/documents` | Creditor with editable case. Body is a PDF up to 5 MiB, with `X-File-Name` and `X-Document-Category` headers. |
| `GET /cases/:id/documents/:documentId` | Existing case authorization. Audited, server-proxied attachment for a clean, unexpired file. |

Financial POST routes accept a scoped `Idempotency-Key` of 16–128 URL-safe characters in transaction mode. Keep the same key for retries of the same action and body. A changed body returns 409. The financial API returns success after majority commit. Idempotency records remain available for operator reconciliation. Their retention policy needs approval before real use. Case editors send the observed update timestamp and receive a conflict when another edit has changed the record.

## Database and financial rollout

`LEDGER_TRANSACTIONS_REQUIRED=true` checks MongoDB topology and initializes indexes before listening. Replica-set and sharded deployments are supported by the transaction path. The standalone mode remains for fictional fixtures. A server restart alone does not backfill or rewrite ledgers. The database purchases, replica configuration, migration sign-off and production setting changes are external operations.

1. Back up the database and restore into isolated staging. Check unique case IDs, invoice references and reversals. Compare case totals and exported balances against authoritative reconciliations.
2. Build indexes in staging and measure startup. The two register indexes cover organization plus recent updates, with and without status. Catalog and review index creation time and capacity before production rollout.
3. Stop legacy writers before switching the ledger to transactions. Deploy the candidate. Check `/api/health` and `/api/v1/meta/release`, then test verification, reversal, overlapping actions and replay with fixtures.
4. For rollback, pause writes first and preserve a pre-rollback snapshot. Existing ledger and activity schemas remain readable by the previous release. Older versions do not honor replay records. Reconcile any ambiguous requests before reopening writes. Do not drop new collections as part of an application rollback.

## Private documents

Keep `PRIVATE_DOCUMENTS_ENABLED=false` until staging and policy checks have passed. Configure `DOCUMENT_BUCKET`, `DOCUMENT_REGION`, `DOCUMENT_RETENTION_DAYS`, `CLAMAV_HOST` and `CLAMAV_PORT`. Use the AWS credential chain through a least-privilege identity. Deploy the ClamAV daemon on a private network with updated signatures and a matching stream limit. A scanner fault fails closed. Files that fail scan never reach S3. Quarantined metadata reserves a bounded slot until cleanup.

Set bucket public-access blocks, encrypted storage, private network access where applicable, TLS-only policies and retention aligned with contractual requirements. The API uses a short-lived signed S3 request on behalf of the authorized session. The browser receives a streamed attachment and no S3 object key or presigned URL. Store the delete grant separately for the retention job where possible.

Schedule `node apps/api/src/purge-documents.js` in the approved environment. It processes up to 100 expired records per run, deletes objects first and leaves failed deletions retryable. Expiration prevents new downloads before physical cleanup. Validate lifecycle cleanup of old object versions, snapshots and replicas under the same policy. A versioned bucket needs a separate version-expiration rule. Current category validation is syntactic. Approval of mandatory evidence by case type, legal hold, restore access, retention exemptions and production malware test results remain release gates.

Private object storage, managed database backups, an always-on compute plan and a scanner worker may incur fees. Estimate cost using expected capacity, file size, scanning CPU, request count and download volume. This branch creates no paid infrastructure.

## Hosting and recovery

The live Render Free service `CollectDesk` tracks `main` and its configured HTTP health check path is empty. The repo Blueprint already has `/api/health` for a differently named service. Review the deployed service's configuration before changing either source. The confirmed launcher race started Next.js before the API listener. The candidate waits for an internal health response backed by a MongoDB ping. Readiness and API traffic use the same build-time proxy target. Staging should also verify wake-up, disconnect and restart behavior.

During the live probe on 18 November 2026 IST, the first health request returned 503 after 30.106 s. The next release request returned 200 in 0.591 s and the homepage returned 200 in 0.707 s. Render reported `d5245132e781` live. The scoped 503 query returned no matching Render logs. A second probe returned 503 for readiness after 31.475 s and again after 0.874 s, while release metadata returned 200 with MongoDB connected. A local reproduction set a different runtime proxy target and reproduced simultaneous readiness 503 and API 200. This confirms a configuration failure mode. The live runtime variable value was unavailable and the live root cause remains unproven.

For an authorized staging rollout, configure the HTTP health path, collect repeated cold and warm timing samples, and watch startup, memory, restart count and Atlas connection events. A paid always-on service is a candidate if measured sleep or resource limits conflict with the agreed service objective. Keep credentials and release flags in the service's secret store.

Define RPO and RTO with the business. Back up MongoDB and the document bucket under an approved policy. Restore both into quarantined staging, disable outbound customer email, and confirm tenant scopes, case totals, audit associations and document mappings. Rotate secrets or revoke compromised sessions before reopening access. Record recovery time, checks performed and any data gap. Escalate restore failures to the designated operations owner.

## Load test and production prerequisites

`node scripts/benchmark-portfolio.mjs` creates disposable fictional portfolios of 100, 1,000 and 20,000 cases. Seven warm loopback HTTP samples per operation were taken after an initial request. Two register indexes reduced the 20,000-case median from 65.4 ms to 5.0 ms and its status-filtered variant from 43.0 ms to 4.1 ms. Exact dashboard totals still took about 1.7 s at 20,000 cases. A higher-scale dashboard needs a verified balance projection or measured aggregation revision before promising a latency target.

Review authentication, authorization, browser headers, session revocation, HTTP rate policy, audit integrity, IAM, tenant isolation, secrets and dependency management with an independent ASVS assessment. Current process-local limits need a shared limiter behind multi-instance hosting. Verify accessibility with keyboard and screen-reader users. Report subscriptions, durable event delivery, production monitoring, a backup restore drill and staging provider verification remain open.

For the intended operating jurisdictions, obtain review of controller and processor responsibilities, data transfers, collection licensing and communications, document retention, dispute procedures, audit access and incident reporting. For an Indian deployment, have qualified counsel assess the applicability of the Digital Personal Data Protection framework and any sector rules applying to the creditor or collection operator. Enable real onboarding only after independent security, business, privacy and operational approval.

## Verification recorded for this branch

- Local Chromium passed the creditor, administrator and operator workflow with the transactional ledger enabled. The responsive suite checked 200 route, viewport and theme combinations.
- Sidebar navigation reused its initial session check over six routes. Local click-to-heading durations ranged from 60 to 125 ms, and deleting the test cookie sent the next protected request back to sign-in.
- The hosted readiness regression reproduced 503 from the old health route and 200 from the API using a deliberately wrong runtime proxy target. The revised shared rewrite returned 200 for both endpoints with the same test configuration. A paused local MongoDB process then returned readiness 503 in 1.508 s and recovered to 200 in 0.005 s after resuming.
- The isolated replica-set suite passed 16 tests. Provider checks use fictional Google signatures, mail doubles, and storage and scanner fixtures. The test suite also exercises the ClamAV wire framing against a local fake daemon.
- The production dependency audit had zero reported advisories after the Nodemailer upgrade. This audit covers the resolved dependency tree on the check date.

[Browser captures](screenshots/README.md)
