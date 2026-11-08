# CollectDesk · reviewer demonstration script

**Purpose:** show the fictional-data MVP to a reviewer without real invoices or payment activity. The automated browser suite exercises this workflow against an isolated CI database. A human reviewer should still verify the public deployment and login using the workspace's private demo password.

## Before the meeting

1. Open the [live login](https://collectdesk-preview-ah80.onrender.com/login) in a fresh browser session.
2. Check [API health](https://collectdesk-preview-ah80.onrender.com/api/health). Expect HTTP 200 with `{"ok":true}` once the free instance is awake. The first request may be slow or time out after inactivity.
3. Ensure you have the **private** demo password from the Render Environment page. Do not put it in this document.
4. Never upload or enter real debtor, banking or invoice information.

## Creditor — invoice submission

1. Sign in as `creditor@demo.collectdesk.test`.
2. Open **All cases** and inspect the statuses and search/filter controls.
3. Create a fictional overdue invoice, save it as a draft, and edit its description if desired.
4. Submit it for review. Confirm the timeline and `Submitted` status.
5. Confirm that editing submitted invoice financial details is no longer allowed.

## Administrator — review and assignment

1. Sign out explicitly and sign in as `admin@demo.collectdesk.test`.
2. Find the submitted case, **Accept** it with a documented reason and a fictional 20% fee rate.
3. Assign the demo operator.
4. Place the case **On hold**, provide a reason, then **Resume** it. Observe the timeline entries.
5. Verify that **Close case** requires a reason and explicit confirmation.

## Operator — controlled updates

1. Sign in as `operator@demo.collectdesk.test`.
2. Open the assigned case and add a creditor-visible progress update.
3. Add a second internal-only update.
4. Confirm the operator has no admin receipt verification/closure actions.

## Creditor — privacy boundary

1. Sign in again as the first creditor. Confirm the public update appears but the internal update does not.
2. A case belonging to `creditor2@demo.collectdesk.test` must not be visible or accessible by URL.
3. Open the dashboard and verify the correct totals and case-status navigation.

## Administrator — fictional receipt reconciliation

1. Record a test pending receipt. Confirm the recovered amount **does not** increase yet.
2. Demonstrate rejecting an erroneous pending receipt with a reason.
3. Verify the valid pending receipt. Confirm recovered and estimated fee totals update.
4. Use **Correct receipt** and document the reason. Confirm the system creates a separate verified reversal and adjusts net recovery.
5. If no receipts remain pending, close the case with a documented reason. Closing does not mark outstanding principal as recovered.

## Evidence for the reviewer

- Live Render URL and GitHub repository
- Screenshots and logs from the latest passing [GitHub Actions browser audit](https://github.com/Syed-Nazeer-07/CollectDesk/actions)
- The [implementation status](IMPLEMENTATION_STATUS.md) and [product requirements](Commercial_Collections_PRD_v0.1.pdf)

**Scope note:** this is a prototype, not a production debt-recovery service. The evidence filename field does **not** upload documents, and receipt entries do **not** represent actual payments.
