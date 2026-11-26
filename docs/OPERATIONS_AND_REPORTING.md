# Operational reporting and follow-ups

Recovery reports aggregate verified ledger movements by verification date (India business time), scoped to currently accessible cases, with gross receipts, reversals, and signed net totals. Legacy verified entries without verification timestamps are excluded rather than assigned invented dates. The UI uses actual results, supports date filters and integer-paise CSV. A maximum 366-day date range bounds queries.

The staff queue stores one internal next action per active case. A revision token prevents stale reschedules/completions, and the case mutation plus audit event commits atomically. Closing a case clears the next action; historical audit entries remain. Creditors cannot access these internal notes or queue. No external reminders or debtor outreach are sent; due status is calculated at read time.

This is a fictional-data technical demo. Reports are not accounting statements, and current operator assignments do not measure historic individual performance. Performance indexes are added for the date range and queue; no throughput claim without benchmark data.

## Validation and operational reliability
- Receipt recording supports explicit safe retries through the unique case/reference key. An identical amount and actor replay the original result, while conflicting requests fail. Other mutations do not yet promise general idempotency.
- The administrator control room includes pending verification, operator workload and missing assignments. The API metrics are process-local, capped at 2,048 samples over 30 minutes, and never log user/tenant IDs, paths, headers or request bodies.
- CI exercises 600 synthetic cases and receipts, eight concurrent clients and 64 reads; the baseline passing run 45791817073 recorded p50 58.7 ms, p95 342.1 ms and max 368.7 ms. This is not a production SLA.
- Browser audits measure layout overflow across five viewports and both themes, with 200 successful checks in that baseline run.
## Attachment consistency
New sample PDF uploads (1 MiB maximum) use ordinary BSON binary documents, with creation/deletion and audit in one transaction. Existing GridFS files remain readable/deletable through the original lease path; legacy deletion is not atomic. Quota counts both storage types. No automatic migration or deletion. See https://www.mongodb.com/docs/manual/core/gridfs/.

Administrator workload counts now link to an active-case register with explicit server-enforced assignment filters, also applied to exports. Non-administrators cannot use this filter, and the filtering helper intersects existing restrictions rather than replacing them.
