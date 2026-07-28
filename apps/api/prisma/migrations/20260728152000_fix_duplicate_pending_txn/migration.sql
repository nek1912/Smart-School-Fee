-- Prevent duplicate pending/success transactions per fee assignment
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_unique_active_per_assignment"
ON "transactions" ("fee_assignment_id")
WHERE "status" IN ('pending', 'success');
