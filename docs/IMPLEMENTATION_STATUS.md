# CollectDesk · implementation and verification status

**Review date:** 8 November 2026  
**Current stage:** hosted fictional-data MVP; **not production ready**

## Verified capabilities

| Area | Scope |
| --- | --- |
| Web UI | Login, role-based navigation, dashboard, searchable/paginated case register, case details, mobile case cards |
| Creditor | Create and edit own drafts; submit overdue invoices; resubmit after information requests; see own organization's visible progress |
| Administrator | Review, accept/reject/request information, assign operator, hold/resume/close with a reason |
| Operator | Access assigned cases and post public or internal progress notes |
| Finance demo | Record and reject pending receipts, verify eligible receipts, reverse verified receipts as separate corrections, show verified net recovery and illustrative fees |
| Security | Strict input validation, origin checks, role/organization boundaries, httpOnly signed cookies, password hashing, rate limits |
| Storage | MongoDB Atlas fictional demo database; local MongoDB via Docker Compose |
| Deployment | Render free web service with Next.js and Express in one container; CI-gated GitHub deployment |

## Automated test evidence

- **Unit and MongoDB integration tests:** CI runs against an isolated test database. Financial concurrency, tenant access, public/internal updates, review, assignment, pending/verified/reversal logic, invalid transitions and state enforcement are exercised.
- **Chromium browser audit:** role-by-role invoice workflow, admin actions, status transitions, receipt verification/correction, access boundaries, dashboard navigation and mobile layouts.
- **Hosted image verification:** builds the Render Docker image and starts both application processes with CI MongoDB; checks login/session/data through the frontend proxy.
- **Public HTTPS diagnostics:** confirms site response, database-backed health, origin checks and invalid-password rejection. The first outside-network run required multiple attempts after timeouts; the service subsequently responded normally.
- **Local verification:** user reported nine successful authenticated Docker Compose smoke checks.

The precise results for the newest commit must be checked under **[GitHub Actions](https://github.com/Syed-Nazeer-07/CollectDesk/actions)**. The tests are not a substitute for an independent penetration test or a real authenticated session at the public hosted URL.

## Design and behavior decisions

1. **Financial truth:** only verified receipts less verified corrections count as recovered. Recording a pending receipt does not affect the reported recovery.
2. **Case status:** accepted or assigned cases may be held and resumed; closed is terminal in this demo. Closure may leave outstanding principal, but cannot proceed while a receipt is pending.
3. **Invoice immutability:** once a creditor submits an invoice, the API refuses further edits except where the case returns to `needs_info`. The database write also checks status to prevent a concurrent submission/edit race.
4. **Corrections:** administrators can reject incorrect pending receipts or reverse a verified receipt once, with mandatory reasons and visible audit events.
5. **Document boundaries:** `evidenceLabel` is a text reference only. This prototype does **not** store or scan uploaded files.

## Known limitations and next stage

| Priority | Limitation | Required before real commercial use |
| --- | --- | --- |
| High | Free Render sleeps when idle; cold starts have exceeded 95 seconds during public diagnostics | Always-on service or a hosting redesign; no promise of instant availability on the free tier |
| High | Financial lease is not multi-document ACID transactionality | MongoDB transactions, reconciliation, idempotency and event durability |
| High | Atlas IP rule currently allows `0.0.0.0/0` for this isolated demo | Allowlist the actual Render service outbound IP ranges or use private networking |
| High | Shared seeded demo account passwords | Identity management, per-user accounts, MFA, password reset, and access reviews |
| Medium | Evidence label rather than a safe file upload pipeline | Private object storage, file validation, malware scanning and scoped access |
| Medium | No real debtor communication, notifications, legal workflow or payment provider | Requirements approval, compliance review and secure integration |
| Medium | No guaranteed backup/recovery, uptime SLA or alerting | Production monitoring, backup/restore drills and incident response |
| Medium | Hosting lacks a verified live login using the actual secret from a browser outside CI | Authorized end-to-end hosted login test using credentials stored securely |

**Not a production release:** do not use this system for actual debt collection, money movement, real debtor information, or legal notices. Its collection and recovery operations are fictional and illustrative.
