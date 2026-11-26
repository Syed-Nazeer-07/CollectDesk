# Phase 2: transactional ledger

- Case creation, draft edits, submission, review, assignment, status transitions, notes and all receipt decisions commit their audit records in the same MongoDB transaction.
- The case document is the serialization point; concurrent mutations retry against a fresh snapshot. HTTP success is emitted only after commit. Evidence uploads still use the existing lease (GridFS is not included in this transaction).
- MongoDB replica set or sharded deployment is mandatory. No standalone fallback. Local Compose, local memory launcher and CI use replica sets. The existing Render/Atlas architecture is retained; verify the actual provider topology before deployment.
- The administrator-only per-case reconciliation endpoint compares ledger totals, pending amounts, reversal links and structured audit links. It is read-only and flags missing/legacy audit metadata without guessing historical facts.
- Failure injection covers receipt recording, verification, reversal and operational transitions. Tenant-mismatched receipt and activity records are excluded from ordinary reads; reconciliation detects mismatches.
- Platform administrators retain global operational authorization, while creditors and assigned operators stay scoped. This is the existing trust model, not a tenant-admin redesign.
- Remaining: provider topology validation, production backups and recovery drills, comprehensive external identity/email review, GridFS/audit consistency, durable idempotency keys, dual-control policy for reversals, and real-data compliance review.

## Identity and user interface follow-up

- Logout now revokes the signed session server-side using a hashed token and TTL index. New tokens use unique JWT IDs. Existing valid tokens remain compatible until revoked/expired.
- Inactive creditor organizations cannot access case operations, but can still contact support. Password changes, email verification, company onboarding and invitation activation use transactions. New passwords have a 72-byte bcrypt limit.
- Shared workspace styling has neutral light/dark surfaces and denser typography. Dashboard priorities are tailored by role; the public landing page retains its actual sample-data scope. Administrators can run read-only reconciliation from a case page. Browser tests cover the reconciliation control.
- The financial dashboard uses a tenant-matched lookup and decimal accumulation. Historical synthetic seed receipts without structured audit metadata are intentionally flagged rather than silently repaired.
