# CollectDesk release readiness — playbook adaptation

> **Scope:** CollectDesk sample-data MVP only. This document adapts Ricoz Innovation's *30-Day Product Execution & Go-To-Market Playbook* (Part I/II) to the project's current stage. It is a working checklist, **not** a claim of sponsor approval, compliance certification, or permission to process real invoices or money.

## Release ownership and evidence

Each work item needs a named owner, reviewer, acceptance criteria, due date, and linked proof (commit, test output, screenshot, UAT record or incident log). Record exceptions rather than marking untested features complete.

| Workstream | Required acceptance evidence | Release blocker? |
| --- | --- | --- |
| Core customer journey | Creditor creates draft, submits an overdue fictional invoice; admin reviews/assigns; operator updates; admin verifies/corrects a receipt; creditor sees allowed outcome | Yes |
| Identity and tenant isolation | Email and Google authentication tested on live origin; invalid requests denied; admins/operators have assigned roles; separate creditor companies cannot access each other's records | Yes |
| Support and onboarding | New users can finish company setup, read first-use guidance, submit tickets; admin can resolve; requester can view outcome | Yes for a supported external pilot |
| Quality & accessibility | Automated integration, browser, keyboard and responsive checks with linked artifacts | Yes for critical journeys |
| Reliability & security | Monitoring, alerts, known-issue register, test restore of backup, documented rollback and secret handling | Yes for real-money or real-customer-data deployment |
| GTM | Public landing page and signup conversion route verified; claims and sample-data limitations accurate; approved measurement approach | Yes before promotion |
| Compliance | Authorized legal/privacy and business review for genuine commercial collections, including data handling, debtor contact, consent and retention | **Mandatory before real use** |

## MVP scenarios to verify

1. **Creditor:** Register with verified email or Google; complete company setup; create a fictional case and submit only when overdue. Other creditors must not access it.
2. **Administrator:** Review accepted/rejected/information-requested cases; assign only valid operators; verify and reverse fictional receipt entries with an audit trail.
3. **Operator:** Access only assigned cases and appropriate activity. Internal notes must not leak to creditors.
4. **Support:** Any signed-in user can open a support request, including before first company setup. Only admins may update its state or resolution; only its creator and admins may view it.
5. **Onboarding:** Fresh creditor dashboard shows step-by-step setup and calculates progress from existing scoped records; completed accounts are not forced through it.
6. **Operations:** Verify Render release SHA, database connectivity, error reports, failed sign-ins, service availability and safe rollback.

## Known scope restrictions and next priorities

- **Sample data only.** CollectDesk does not collect payments, contact debtors, hold actual financial documents or provide regulated debt-collection services.
- Support requests are visible in the workspace, **not** guaranteed email alerts, real-time chat or a staffed service-level agreement. Confirm the person responsible for monitoring the admin queue.
- Public staff registration is prohibited; implement administrator-issued invitations if a larger operations team needs accounts.
- Uploaded invoice evidence is **not implemented**. Design private storage, content verification, authorized URLs, retention, malware scanning and deletion before enabling files.
- Account email delivery depends on configured external sender; verify the end-to-end live flow separately from CI mocks.
- For production use, assess privacy, legal permissions, multi-document transactional reconciliation, monitoring, tested backups and disaster recovery.

## Release decision (to complete with the team)

| Item | Value |
| --- | --- |
| Release candidate commit | _Record exact SHA_ |
| Product owner / reviewer | _Assign_ |
| QA owner / reviewer | _Assign_ |
| Operations owner / reviewer | _Assign_ |
| CI + browser test evidence | _Link successful run_ |
| Live onboarding, OAuth, email verification | _Attach evidence_ |
| Support response responsibility | _Assign_ |
| Open blocker register | _Link issues_ |
| Decision | **Not authorized for real collections** until the requirements above are reviewed and approved |

## After release

Review new-user activation, support-request resolution, issue severity, role-journey success, signup problems, and reliability daily during the initial stabilization window. Adopt realistic, team-approved targets; do not invent conversion or uptime guarantees.

**Process source:** Ricoz Innovation, *30-Day Product Execution & Go-To-Market Playbook*, Part I, Sections 1.8–1.13; Part II, Phase 4 (G4 readiness) and Phase 6 (stabilization).
