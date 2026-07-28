-- Add confidence and match tracking columns to reconciliation_items
ALTER TABLE reconciliation_items
  ADD COLUMN IF NOT EXISTS bank_description VARCHAR(255),
  ADD COLUMN IF NOT EXISTS confidence INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_explanation TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;

-- Add summary columns to reconciliation_batches
ALTER TABLE reconciliation_batches
  ADD COLUMN IF NOT EXISTS total_rows INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_matched INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_review INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unmatched_count INTEGER DEFAULT 0;
