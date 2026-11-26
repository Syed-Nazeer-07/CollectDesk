# Operational reporting and follow-ups

Recovery reports aggregate verified ledger movements by verification date (India business time), scoped to currently accessible cases, with gross receipts, reversals, and signed net totals. Legacy verified entries without verification timestamps are excluded rather than assigned invented dates. The UI uses actual results, supports date filters and integer-paise CSV. A maximum 366-day date range bounds queries.

The staff queue stores one internal next action per active case. A revision token prevents stale reschedules/completions, and the case mutation plus audit event commits atomically. Closing a case clears the next action; historical audit entries remain. Creditors cannot access these internal notes or queue. No external reminders or debtor outreach are sent; due status is calculated at read time.

This is a fictional-data technical demo. Reports are not accounting statements, and current operator assignments do not measure historic individual performance. Performance indexes are added for the date range and queue; no throughput claim without benchmark data.
