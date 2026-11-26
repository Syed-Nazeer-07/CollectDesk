# Phase 2: transactional ledger

- Case creation, draft edits, submission, review, assignment, status transitions, notes and all receipt decisions commit their audit records in the same MongoDB transaction.
- The case document is the serialization point; concurrent mutations retry against a fresh snapshot. HTTP success is emitted only after commit. Evidence uploads still use the existing lease (GridFS is not included in this transaction).
- MongoDB replica set or sharded deployment is mandatory. No standalone fallback. Local Compose, local memory launcher and CI use replica sets. The existing Render/Atlas architecture is retained; verify the actual provider topology before deployment.
- The administrator-only per-case reconciliation endpoint compares ledger totals, pending amounts, reversal links and structured audit links. It is read-only and flags missing/legacy audit metadata without guessing historical facts.
- Failure injection covers receipt recording, verification, reversal and operational transitions. Tenant-mismatched receipt and activity records are excluded from ordinary reads; reconciliation detects mismatches.
- Platform administrators retain global operational authorization, while creditors and assigned operators stay scoped. This is the existing trust model, not a tenant-admin redesign.
- Remaining: provider topology validation, production backups and recovery drills, comprehensive external identity/email review, GridFS/audit consistency, durable idempotency keys, dual-control policy for reversals, and real-data compliance review.
