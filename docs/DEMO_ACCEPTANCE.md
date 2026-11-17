# CollectDesk demo acceptance

Reviewed on 18 November 2026 IST. The review branch is `collectdesk/workflow-quality`. Its production baseline is `b55067b6735c`. The application remains a fictional-data demonstration.

## Baseline and changes

The original release already implemented the three-role lifecycle, verification and correction of sample receipts, scoped exports, notification read state, support triage and evidence isolation. It passed 45 baseline API tests against an isolated database. The visible gaps were profile editing, recovery of interrupted intake, an absent current-operator name, dashboard ordering by creation date under a latest-update label, and weak feedback for several recovery paths.

| Surface | Changes in the review branch |
| --- | --- |
| Landing | Added keyboard-reachable mobile section navigation. Aligned the sample portfolio and lifecycle with visible case statuses and consistent sample balances. |
| Authentication | Reused provider availability from the sign-in screen, added script-load feedback and clarified pending verification. Preserved email, Google, invitation and recovery contracts. |
| Workspace | Added a skip link, improved compact navigation targets and reduced repeated heading and sidebar copy. |
| Dashboard | Put exact outstanding and verified recovery amounts first. Added links to relevant role queues and sorted recent cases by their latest update. |
| Register | Added accessible CSV feedback, prevented exports of stale search criteria and kept pagination and scoped download limits. |
| Case intake and detail | Restored unfinished entries for the signed-in account in the same browser tab, preserved persisted drafts and displayed the assigned operator's name. Kept invoice and ledger information above supporting PDFs and asked for confirmation before deleting a sample PDF. |
| Profile | Added self-service display-name editing with validation and a persistent write for the authenticated account. |
| Support | Added an optimistic update check on administrator saves to prevent overwriting a more recent decision. Kept the decision history. |
| Activity | Reduced top-bar requests to a scoped unread count and guarded against older badge responses overriding newer responses. |
| Staff and provider-dependent screens | Verified access, layout and unavailable-provider states. Existing invite delivery and activation remain protected behind provider configuration. |

## Backend and performance

- Session verification distinguishes invalid credentials from transient MongoDB failures. Requests combine caller cancellation with a 75-second deadline that also applies while reading response bodies.
- Access scopes for incomplete creditor and operator records fail closed. Profile editing accepts only a display name, and case access remains subject to organization or current assignment.
- Dashboard aggregation streams case rows in batches of 128 and transfers one net verified ledger total per case. It reuses the integer-paise fee rules and returns at most six recent records. This bounds the application-side working set. It still scans accessible cases to compute exact totals.
- On one seeded creditor account the full notification feed response was 560 uncompressed bytes. The scoped badge response was 17 bytes. This is a fixture measurement, and production latency was not benchmarked.
- Case detail shares the shell's session result. Sign-in shares a single provider-options fetch, and external stylesheet imports were consolidated into the root layout.
- Ledger lease guards and traceable reversals remain in effect. Reconciliation actions and timeline events remain separate MongoDB writes. Multi-document transactional guarantees against a failure between those writes require a replica-set design and a separate migration and recovery review.

## Verification

| Check | Result |
| --- | --- |
| `npm ci` | Passed on supported Node 24.22.1. |
| `npm run typecheck -w @collectdesk/web` and `npm run build` | Passed. |
| `npm test` with isolated MongoDB 8.2.6 | 46 passed, zero failed or skipped. Covered self-only profile edits, support conflicts, staff invite expiry/replay, provider contracts, authorization, evidence and financial rules. |
| `npm run smoke` | Passed against the local hosted launcher, including health, same-origin sign-in, authorization and pagination. |
| Seeded Chromium workflow audit | Passed. Covered local registration and verification, draft recovery and persistence, request-info and resubmission, three roles from intake through closure, support, CSV, notifications, PDF operations, and dashboard retry after a fixture HTTP 503. |
| Chromium responsive sweep | Passed 150 route, viewport and theme combinations at 360, 390, 768, 1366 and 1920 px, with reduced motion. The sweep measures page overflow and uncaught page exceptions. Screenshots complement these checks. |
| Hosted image | Standard Docker builds failed while fetching npm packages. With the local npm cache mounted offline, the container installed 204 packages. The Docker filesystem ran out of space before the build layer. Full container startup is unverified. The host-process launcher, production Next.js build and same-origin proxy passed separately. |

The first new assertions treated a future-dated draft as an invalid case, waited for a verification link that local console mode consumes automatically, and expected uploads to retain their filename on download. The final suite preserves future-dated draft support, verifies the local automatic-verification path, and checks the safe generic PDF filename plus the actual downloaded bytes.

To include the extra browser scenarios, start a disposable seeded stack in development mode with `PUBLIC_REGISTRATION_ENABLED=true` and `SAMPLE_EVIDENCE_ENABLED=true`. Run `AUDIT_LOCAL_REGISTRATION=true AUDIT_SAMPLE_EVIDENCE=true npm run audit:browser` with the fixture's private `DEMO_SEED_PASSWORD`. Email verification and password recovery provider contracts use test fixtures in the API suite. Google uses a test signing key and token. Invitation delivery uses an HTTP test double.

[Actual browser screenshots](screenshots/README.md)

## Live Render observation

- The public health and release endpoints returned HTTP 200 after an initial homepage timeout. Release metadata reported `b55067b6735c` and MongoDB connected. Render listed the same commit as the live deployment. The 503-filtered service log query returned no matches in the queried period. The earlier reported 503 remains unexplained.
- The live Free Docker service named **CollectDesk** tracks `main`. Its health-check path is empty, while `render.yaml` specifies `/api/health` under the Blueprint service **collectdesk-preview**. Confirm which configuration will own the live service before applying the Blueprint. For a dashboard-managed service, set **Settings → Health Check Path** to `/api/health` during an authorized release and verify the endpoint and release SHA.
- This review branch was not deployed. Live verification was read-only.

## Remaining acceptance work

- Use the approved sender and TEST accounts on the deployed candidate to verify delivery, verification, recovery and staff activation. The Google OAuth web client must authorize the exact public origin and pass a real account test. Render Free restricts outbound SMTP. Use a documented HTTPS sender for that plan.
- Run the original container build in CI with registry access and sufficient disk. Confirm the reviewed commit through deployed three-role acceptance and check actual mobile devices, browser zoom and broader assistive-technology coverage.
- Obtain product-owner acceptance of the disputed-invoice policy and demo scope. Real-data use also requires legal and privacy approval, regulated operating procedures, malware scanning and retention controls, reviewed accounting transactions, monitoring and a verified backup restore.

[Feature completion matrix](FEATURE_MATRIX.md) · [Release-readiness checklist](RELEASE_READINESS.md)
