# CollectDesk engineering acceptance

Baseline b55067b. Evidence uses the fictional-data PRD, repository checklist, routes, isolated database integration suite and seeded Chromium audit. The baseline passed 45 API tests on Node 24.22.1 with disposable MongoDB.

| Workflow | Initial assessment | Acceptance work |
|---|---|---|
| Email registration, verification, recovery, Google identity | Implemented with provider-dependent paths | Verify local provider contracts. Live sender and authorized origin require owner access. |
| Company onboarding and role scoping | Implemented, covered by API suite | Preserve tenant and assignment restrictions. |
| Profile management | Missing self-service name update | Add validated self-only write, UI, permission and persistence checks. |
| Intake, drafts, edit, review and assignment | Implemented | Run three-role browser flow, show current operator and improve retry behavior. |
| Activities, private notes, hold and closure | Implemented | Exercise visibility and transitions in isolated tests. |
| Sample receipt decisions, reversals, fee and outstanding balance | Implemented | Retain integer-paise rules, execute financial regression suite. |
| Register, scoped CSV and search | Implemented | Run download, sorting, responsive and empty-state checks. |
| Dashboard | Defective recent activity ordering | Align list order with latest updates and reduce payload reads. |
| Notifications, persistent read state | Implemented | Run API and browser coverage for private activity and unread state. |
| Support intake, queue and history | Implemented | Run privacy, resolution and history tests. |
| Staff invitation and activation | Implemented, external delivery dependent | Test invite state locally. Verify actual sender separately. |
| Synthetic evidence | Implemented behind feature flag | Run isolation, file limit and retrieval tests. Real documents require scanning and retention approval. |
| Session and request recovery | Partial | Distinguish DB errors from lost sessions, bound requests during navigation and body reads. |
| Public site, themes and accessibility | Implemented, visual acceptance pending | Review real screenshots in both themes and five widths. |
| Hosted readiness | Earlier 503 reported, cause unknown | Check health and release independently of local QA. Owner acceptance, backups and alerts remain external. |
