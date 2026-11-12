# CollectDesk — remaining implementation checklist

Last updated: **2026-11-12**. The comprehensive app review and reliability upgrades are implemented in code; current-release CI and external provider/sponsor checks must still be confirmed. See [full audit](COMPREHENSIVE_AUDIT_2026-11-12.md).

This is an engineering execution checklist, not an assertion that the platform has been approved for real-money use. Preserve the existing demo workflows and design. Each checkbox requires implementation evidence, test results and live verification.

## Phase 1 — Staff access and identity
- [x] Backend: one-time administrator-issued **operator** invitations (no public role escalation or arbitrary admin self-service)
- [x] Reusable verified email delivery for invitations; fail closed if no live email provider is configured
- [x] Invite acceptance with secure password, expiry, replay protection and session validation
- [x] Staff-management interface accessible only to administrators
- [x] Integration tests: cross-role 403s, expiration, token reuse, existing-account conflicts, no secrets returned
- [ ] Verify actual email delivery and account sign-in on deployed Render (needs sender configuration)

## Phase 2 — Collections integrity
- [x] Add optional independent receipt approval (`SEPARATE_RECEIPT_APPROVAL=true`) with backend authorization and UI guidance; existing single-admin demo remains unchanged when disabled
- [x] Exercise duplicate submissions, verification/reversals and competing receipt/evidence updates in API integration tests
- [ ] Resolve disputed-invoice policy with business owner and encode accepted rule
- [ ] Independent multi-document transaction/reconciliation assessment for any real financial use

## Phase 3 — Evidence/document security
- [x] Implement **feature-flagged synthetic-only MongoDB GridFS PDF** storage (1 MiB/file, three per case), with private download and case-scoped permissions — CI verified, production scanner/retention NOT approved
- [ ] Decide private storage provider and object retention policy; approve access/tenant isolation
- [x] Implement synthetic file upload/download/delete with server-side authorization, size/content checks and case file count limit (production acceptance still blocked)
- [ ] Integrate malware scanning or hold/untrusted-file quarantine; validate retention/deletion
- [x] Add CI isolated tenant tests and demonstrate authorized private retrieval in CI (live deployment verification still pending)
- [ ] Keep **real financial documents prohibited** until security and privacy reviews pass

## Phase 4 — Reliability & operational readiness
- [x] Versioned release identifier in health/status endpoint (avoid exposing secrets)
- [x] Add daily no-credentials public HTTPS health, signup, login and API smoke check via GitHub Actions (baseline synthetic check only)
- [ ] Production monitoring/error alert routing and designated operator
- [ ] MongoDB Atlas backup policy + verified restore drill (must configure on actual provider)
- [ ] Verify Render deployed SHA matches the approved GitHub release; live diagnostics currently detect/report drift but do NOT fail on a deployment still in progress; also test Google origin and real transactional email
- [ ] Full live three-role UAT with acceptance evidence for each journey
- [ ] Document release rollback, open defects and responsible approvers

## Phase 5 — Scope acceptance
- [ ] Compare approved PRD, sponsor request and latest demo; record any additions/omissions
- [ ] Obtain acceptance of Render link versus requested Vercel link
- [ ] Obtain Rajesh/team sign-off on MVP boundaries and any real-data requirements

Progress updates should change boxes only after evidence is recorded. GitHub CI is not by itself proof of a real-world service being production ready.

## Phase 6 — Comprehensive reliability and accessibility pass (Nov 12)
- [x] Refresh case state under the financial lease and recheck assignment state atomically
- [x] Enforce the overdue due-date condition at database submission time
- [x] Serialize synthetic evidence changes; block submission during attachment writes and test quota races
- [x] Improve in-app disputed-invoice warning without inventing a new business decision policy
- [x] Disable operator invitation submission when no provider is configured
- [x] Protect sensitive API responses against shared caching and update staff activation headers
- [x] Abort stale case-list/dashboard/document status requests; improve mobile menu keyboard interaction
- [x] Change direct health response to HTTP 503 when MongoDB is unavailable
- [x] Extend external anonymous-route diagnostics and report deployed-commit drift
- [x] Make CI/Compose/Render builds reproducible with `npm ci` and the lockfile
- [ ] Compare generated desktop/mobile screenshots and real-device user flows after the **final** Render deployment
- [ ] Obtain actual backup/restore test, malware scanning, compliance review, and supervisor-approved go-live scope
