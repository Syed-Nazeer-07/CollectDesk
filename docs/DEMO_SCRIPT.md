# First milestone demonstration script (proposed)

This walkthrough uses **fictional** data and assumes successful npm installation, MongoDB connection, and seeded accounts. Do not report it as tested until executed and screenshots are recorded.

## 1. Creditor — secure submission
- Sign in as `creditor@demo.collectdesk.test` with local demo seed password.
- Open **All cases**: see only Acme Industrial Supplies cases.
- Click **New case**, use debtor `Test Supply Co`, invoice `TEST-0001`, dates and ₹10,000.
- Click **Save draft**; open the case, refresh, edit notes, then submit for review.
- Confirm status becomes **Submitted**, with a timestamped timeline event.

## 2. Administrator — review
- Sign out; sign in as `admin@demo.collectdesk.test`.
- Open new submitted case. Review decision **Accept**, fee **20%**, reason `Documentation reviewed for fictional prototype`.
- Confirm status becomes **Accepted** and a timeline record appears.
- Select Jordan Lee and **Assign case**. Confirm **In progress** status.

## 3. Operator — activity
- Sign in as `operator@demo.collectdesk.test`.
- Open assigned case, add a creditor-visible update such as `Documents checked; awaiting internal follow-up`.
- Confirm it appears in timeline.

## 4. Creditor — verification of visibility
- Sign in as creditor again. Confirm operator update appears.
- Open a URL to another creditor's case; **must receive 404**, not another tenant's details.
- Confirm internal-only notes do not appear.

## 5. Optional financial demonstration
- Admin records a fictional ₹2,000 receipt with reference `UTR-DEMO-001`. It shows **Recorded / Awaiting verification**.
- The recovered total must remain unchanged before verification.
- Admin verifies it. Only then should verified recovered rise by ₹2,000, remaining principal fall by ₹2,000 and a 20% estimated fee show ₹400.

## 6. Deliverable to supervisor
- Research PDF, PRD PDF, repository access (after ownership choice), screenshots of tested flows, and unit/integration test results.
- Phrase as **'proposed first milestone demonstration'**; do not claim a precise 45% until the scope is agreed.
