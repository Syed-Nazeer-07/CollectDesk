# CollectDesk — release-readiness checklist

**Updated:** 2026-11-16  
**Intended scope:** Fictional-data technical-evaluation MVP. This checklist is not permission to process actual invoices, collect payments or provide regulated debt-collection services.

## 18 November 2026 candidate update

The local workflow-quality branch passed the isolated API, production build, three-role Chromium, responsive and hosted-launcher checks described in the [demo acceptance report](DEMO_ACCEPTANCE.md). The live Render service still serves the baseline `b55067b6735c`. Record the approved candidate SHA and repeat the release checks after an authorized deploy.

## Current status

The application contains the three-role case workflow, staff invitations, support handling, notification filters and opt-in **synthetic-only** PDF evidence. Automated test coverage exists, but a green build is **not** evidence that real account providers, all live flows, monitoring and business acceptance have been verified.

| Area | Implemented in code | Still to verify / approve |
| --- | --- | --- |
| Core creditor → admin → operator workflow | Case lifecycle, role checks, activity and sample receipt actions | Full three-role UAT against the exact deployed commit |
| Identity | Signed sessions, Google identity option, verified email option, password recovery | Live Google origin, approved sender and recovery flow using real test accounts |
| Staff management | Admin-issued, expiring operator invitations | End-to-end delivery and invitation acceptance with a configured email sender |
| Tenant isolation | Role-scoped cases, evidence and notifications; API integration tests | Independent authorization review before external customer use |
| Synthetic evidence | Feature-flagged private PDF storage and access checks | Retention policy, malware scanning and approval before **any** real documents |
| Financial integrity | Verified sample receipts, reversal history, optional two-person approval | Disputed-invoice policy, business rules and production-grade reconciliation |
| Reliability | CI, seeded browser audit, health and public preview diagnostics | Alerts, named operator, tested Atlas restore and rollback rehearsal |
| Deployment | Render demo configuration | Exact commit parity and acceptance of Render as the delivery URL |

For implementation details and evidence, see [Implementation Checklist](IMPLEMENTATION_CHECKLIST.md) and [Engineering Audit](COMPREHENSIVE_AUDIT_2026-11-12.md).

## Pre-release process

1. **Freeze the intended change.** Record the commit SHA, scope, reviewer and any open defects. Do not use a passing check from an older commit as proof for a new release.
2. **Run local/CI checks.** Use `npm ci`, `npm run typecheck -w @collectdesk/web`, `npm test` and `npm run build`. Confirm the matching GitHub Actions run passes, including container and seeded browser checks.
3. **Verify the hosted version.** Check `/api/health` and `/api/v1/meta/release` on the deployed service. Compare the reported commit prefix with the approved commit. The daily public diagnostic intentionally warns about commit drift rather than treating an in-progress deployment as failed.
4. **Complete live acceptance.** Use authorized fictional test accounts to verify sign-in, onboarding, case submission, admin assignment, operator updates, receipts, alerts, support, responsive layouts and logout. Test each optional identity flow only when a real provider is configured.
5. **Record approvals and rollback.** Document the approver, outcome and known-good commit or Render deploy to restore if the new version fails. Confirm application/database compatibility before reverting; do not assume a code rollback undoes data changes.

**Do not point browser audit scripts at the live or production database.** They mutate synthetic records.

## Release blockers

For a **demo handoff**, the following still need evidence or explicit acceptance:

- [ ] Live three-role user acceptance test on the deployed SHA, with screenshots and any defects documented
- [ ] Verification of Google sign-in, email verification/recovery and staff invitations where enabled
- [ ] Accessibility and responsive checks on actual target devices, not only Chromium automation
- [ ] Business-owner acceptance of the PRD scope, disputed-invoice policy and hosted URL
- [ ] Named owner to monitor support requests and deployment failures

For **any real customer or financial data**, all of the above plus the following remain mandatory:

- [ ] Legal/privacy review of debt collection, permissions, consent, retention and data handling
- [ ] Approved document storage, scanning, quarantine and deletion/restore processes
- [ ] Independent audit of financial transaction integrity and reconciliation
- [ ] Monitored errors, alert routing, incident response and tested backup/restore
- [ ] Formal go-live authorization from the responsible organization

## Decision record

| Field | Evidence / owner |
| --- | --- |
| Candidate commit SHA | _To be recorded_ |
| Product owner and reviewer | _To be assigned_ |
| QA owner and acceptance artifacts | _To be linked_ |
| CI run for exact SHA | _To be linked_ |
| Hosted commit and UAT results | _To be recorded_ |
| Open blockers and rollback target | _To be recorded_ |
| Decision | **Demo-only; not authorized for real collections** |

After a demo release, review failures, support issues, authentication friction and role-journey correctness. Do not claim production uptime, compliance certification or verified payment behavior without supporting evidence.
