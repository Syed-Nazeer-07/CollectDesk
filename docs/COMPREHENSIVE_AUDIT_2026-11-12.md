# CollectDesk — complete app review and improvement log

**Review date:** 2026-11-12 (IST)  
**Reviewed source:** `main` at the start of this pass: `d38ce06be848de010f6bf440816253eec33adc6d`  
**Rollback branch:** `backup/pre-comprehensive-audit-20261112`  
**Scope:** Fictional-data commercial collections MVP. **Not approval for real payments, actual invoices, or regulated collections.**

## Reviewed surfaces

| Surface | Focus of review |
| --- | --- |
| Public landing page | Navigation, feature claims, illustrative metrics, FAQ, footer, responsive behavior |
| Sign-in and signup | Email verification, Google sign-in, errors, theme, password reset, public role restrictions |
| Company onboarding | First-time creditor setup, permission boundaries and help route |
| Dashboard | Status breakdown, metrics, action links, customer checklist, loading/empty states |
| Case register | Search, status filtering, pagination, responsive table, results state |
| Case creation and detail | Dates, draft/edit/submit, disputed invoices, role-specific actions, timeline |
| Administration | Reviews, operator assignment, financial receipts and reconciliation |
| Operations | Assigned-case access, activity visibility, hold/close handling |
| Help and support | Private intake, administrator updates, decision-history access |
| Staff invitations | Operator-only invite creation/activation, sender availability, revocation |
| Synthetic evidence | Authorized upload/download/delete, file limit and case state |
| Infrastructure | API health, release identity, cache headers, live smoke checks, Docker/CI |

## Implemented in the November 12 improvement pass

- [x] Atomic assignment guard: a case can only be assigned when it is still accepted/in progress and not in another financial update.
- [x] Refresh case state after acquiring the financial lease; recheck assignment and status before a case note is written.
- [x] Optional `SEPARATE_RECEIPT_APPROVAL=true` maker/checker control, leaving the existing single-admin sample mode unchanged by default.
- [x] Document handling uses a short-lived case lease; concurrent uploads respect the three-file quota and block case submission while an attachment is being saved.
- [x] Overdue status is checked in the submission write, not just before it.
- [x] Database-disconnected direct API health responds HTTP 503 instead of reporting success.
- [x] Private, no-store headers on account and case API responses; staff activation pages use no-store/no-referrer.
- [x] Cancel obsolete dashboard and case-search requests instead of keeping them running after navigation or filter changes.
- [x] Mobile workspace navigation exposes its expanded state, closes with Escape and restores focus.
- [x] Show disputed-invoice context visibly without inventing an unapproved auto-rejection rule.
- [x] Disable staff invitation submission when no transactional email provider is configured.
- [x] Expand live smoke checks to more authentication pages, protected endpoints, and the deployed release identifier.

## Acceptance evidence

Use the latest GitHub Actions `CollectDesk checks` run that **corresponds to the release commit**, not an earlier green run. That workflow covers TypeScript, API rules/integration, Next.js build, Render-style container build, and seeded Chromium desktop/mobile tests.

The separate `Live Render preview diagnostics` workflow tests the anonymous public site, application and database health, same-origin proxy, denied anonymous endpoints, and safe release metadata. It **does not** authenticate with a real Google account or create real emails.

The live preview's commit prefix from `/api/v1/meta/release` must match the intended release. A passing public smoke check may still be observing an older deployment and **does not constitute production sign-off**.

## Remaining risks and improvements

### P0 — Required before actual customer financial information

- [ ] Malware scanning/quarantine, private storage lifecycle and delete/restore guarantees for document evidence; current GridFS PDFs are fictional-only and disabled by default
- [ ] Approval of lawful data use, debtor communications, privacy, retention and operational collection policies
- [ ] Transactional reconciliation with genuine ACID guarantees and independently reviewed payment integrity
- [ ] MongoDB Atlas backup/restore test, incident response, monitoring alerts and named on-call owner
- [ ] Real-provider verification of OAuth, transactional email, invitation activation, and password recovery

### P1 — Before handing an external pilot to a supervisor or customer

- [ ] UAT evidence from creditor, administrator and operator accounts on the deployed release
- [ ] Match scope line-by-line against the approved PRD and resolve disputed-invoice treatment
- [ ] Supervisor confirmation that a Render link is acceptable instead of the originally requested Vercel deployment
- [ ] Sign-off on whether strict two-administrator receipt verification must be mandatory
- [ ] Accessibility review with keyboard navigation and screen-reader checks beyond automated assertions
- [ ] Confirm alerts actually reach a team member, not just CI history

### P2 — Growth and engineering quality

- [ ] Rework dashboard aggregation when case volume exceeds demo scale (currently queries accessible cases and receipts in memory)
- [ ] Add pagination/retention to potentially unbounded case activity and attachment records
- [ ] Profile frontend bundle/animation cost on low-powered phones and split large stylesheet modules carefully without changing the approved design
- [ ] Add structured request correlation IDs, privacy-safe error telemetry and concrete service objectives
- [ ] Add coverage for browser/device combinations beyond Chromium and for real low-bandwidth scenarios
- [ ] Harden invitation and attachment operations against database failures using fully transactional workflows if expanded to real use

## Release decision

**Current classification: technically functional, CI-tested fictional-data MVP.** These enhancements improve reliability and user experience but cannot turn it into a finished financial services product without the P0/P1 evidence. Preserve the existing design and three-role lifecycle unless the approved PRD specifically requires a change.
