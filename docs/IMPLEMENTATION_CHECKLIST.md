# CollectDesk — remaining implementation checklist

Last updated: **2026-11-11**. The GitHub CI suite has passed for the staff-invitation and private synthetic-evidence changes; external provider and sponsor checks remain open.

This is an engineering execution checklist, not an assertion that the platform has been approved for real-money use. Preserve the existing demo workflows and design. Each checkbox requires implementation evidence, test results and live verification.

## Phase 1 — Staff access and identity
- [x] Backend: one-time administrator-issued **operator** invitations (no public role escalation or arbitrary admin self-service)
- [x] Reusable verified email delivery for invitations; fail closed if no live email provider is configured
- [x] Invite acceptance with secure password, expiry, replay protection and session validation
- [x] Staff-management interface accessible only to administrators
- [x] Integration tests: cross-role 403s, expiration, token reuse, existing-account conflicts, no secrets returned
- [ ] Verify actual email delivery and account sign-in on deployed Render (needs sender configuration)

## Phase 2 — Collections integrity
- [ ] Separate receipt entry from approval without disrupting the seeded demo; make strict maker/checker requirement configurable
- [ ] Test duplicate submissions, repeated verification, reversals and concurrent updates
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
- [ ] Confirm Render deployed SHA matches GitHub; test Google origin and transactional email
- [ ] Full live three-role UAT with acceptance evidence for each journey
- [ ] Document release rollback, open defects and responsible approvers

## Phase 5 — Scope acceptance
- [ ] Compare approved PRD, sponsor request and latest demo; record any additions/omissions
- [ ] Obtain acceptance of Render link versus requested Vercel link
- [ ] Obtain Rajesh/team sign-off on MVP boundaries and any real-data requirements

Progress updates should change boxes only after evidence is recorded. GitHub CI is not by itself proof of a real-world service being production ready.
