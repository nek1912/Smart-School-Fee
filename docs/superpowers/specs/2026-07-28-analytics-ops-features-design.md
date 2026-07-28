# Smart School FinTech — Analytics & Operations Feature Design

**Date:** 2026-07-28  
**Version:** 2.0 (Post-Review)  
**Status:** Approved for Implementation  

---

## Executive Summary

Four features that transform the Smart School Fee system from a transactional tool into an intelligent financial operations platform. Built on top of the existing Express + Prisma + React/Vite + Zustand monorepo.

---

## Architecture Overview

```
                    ┌─────────────────────────────┐
                    │    AI Collections Copilot    │
                    └──────────┬──────────────────┘
                               │
                    Natural-language queries
                    over analytics engine
                               │
                               ▼
      ┌──────────────────────────────────────────────────────┐
      │         Analytics & Financial Intelligence Layer      │
      ├──────────┬──────────────┬──────────────┬─────────────┤
      │ Timeline │Reconciliation│  Offline Queue│ Analytics   │
      │ Service  │   Service    │    Service    │   Engine    │
      └────┬─────┴──────┬───────┴──────┬───────┴──────┬──────┘
           │            │              │              │
           ▼            ▼              ▼              ▼
     ┌──────────────────────────────────────────────────────┐
     │     Transactions • Fee Assignments • Receipts         │
     │     Audit Logs • Cheques • Waivers • Penalties • KYC │
     └──────────────────────────────────────────────────────┘
                              │
                              ▼
                    PostgreSQL (Prisma ORM)
```

**Key principle:** Every feature reads from real database data. No hardcoded answers.

---

## Schema Changes Required

### ReconciliationItem — add `confidence` and `matchExplanation` columns

```prisma
model ReconciliationItem {
  id              Int      @id @default(autoincrement())
  batchId         Int      @map("batch_id")
  batch           ReconciliationBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  transactionId   Int?     @map("transaction_id")
  amount          Decimal  @db.Decimal(10, 2)
  statementDate   DateTime @map("statement_date") @db.Date
  reference       String?  @db.VarChar(100)
  bankDescription String?  @map("bank_description") @db.VarChar(255)
  status          String   @default("unmatched") @db.VarChar(30)
  // NEW: 'auto_matched' | 'needs_review' | 'matched' | 'unmatched' | 'rejected'
  confidence      Int?     @default(0)  // 0-100 score
  matchExplanation String? @map("match_explanation") @db.Text
  reason          String?  @db.VarChar(255)
  resolvedById    Int?     @map("resolved_by_id")
  resolvedAt      DateTime? @map("resolved_at") @db.Timestamp()
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamp()

  @@index([transactionId])
  @@index([status])
  @@map("reconciliation_items")
}
```

### ReconciliationBatch — add summary columns

```prisma
model ReconciliationBatch {
  id           Int      @id @default(autoincrement())
  uploadedById Int      @map("uploaded_by_id")
  fileName     String?  @map("file_name") @db.VarChar(255)
  totalRows    Int      @default(0) @map("total_rows")
  autoMatched  Int      @default(0) @map("auto_matched")
  needsReview  Int      @default(0) @map("needs_review")
  unmatchedCount Int    @default(0) @map("unmatched_count")
  status       String   @default("processed") @db.VarChar(30)
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamp()
  items        ReconciliationItem[]

  @@index([createdAt])
  @@map("reconciliation_batches")
}
```

No new tables needed — Timeline aggregates from existing tables. Copilot uses existing dashboard domain services. Offline conflict uses existing Transaction + idempotency.

---

## Feature 1: Smart Reconciliation Autopilot

### What Changes From Current Code

**Current** (`matcher.js`): Binary match/unmatch using exact amount + (same-day date OR reference). No confidence scoring.  
**New**: Weighted multi-criteria scoring engine with 3 buckets (auto-matched, needs-review, unmatched).

### Matching Engine Weights

| Criterion         | Weight | Logic                                       |
|-------------------|--------|---------------------------------------------|
| Amount match      | 40%    | Exact = 40, within ₹100 tolerance = 30      |
| Date proximity    | 25%    | Same day = 25, ±1 day = 20, ±3 = 10, ±7 = 5 |
| UTR/Reference     | 20%    | Exact receipt match = 20, fuzzy partial = 10 |
| Payment mode hint | 10%    | UPI/CASH/CHEQUE inferred from description    |
| Student/fee hint  | 5%     | If reference contains student info           |

Thresholds: **≥90%** → auto_matched, **60–89%** → needs_review, **<60%** → unmatched

### Backend Endpoints

| Method | Path                              | Purpose                            |
|--------|-----------------------------------|------------------------------------|
| POST   | /api/reconciliation/upload        | Upload & parse & score (replaces existing) |
| GET    | /api/reconciliation/:id           | Get batch with all items           |
| PUT    | /api/reconciliation/item/:id      | Approve/reject/override single item |
| POST   | /api/reconciliation/bulk-action   | Bulk approve/reject selected items |
| GET    | /api/reconciliation/history       | List past batches with summaries   |

### Edge Cases
- Duplicate bank rows (same UTR, same amount, same date) → flag
- Multiple internal txns matching same amount on same day → pick highest confidence, rest to needs_review
- Partial payments → match within tolerance
- Bounced cheque debits → skip negative amounts

---

## Feature 2: Student Audit Timeline

### Backend

Single aggregation endpoint that unions events from multiple tables:

```
GET /api/students/:id/timeline?types=payment,penalty&from=2026-01-01&to=2026-12-31
```

**Source tables queried:**
- `Transaction` → payment_initiated, payment_success, payment_failed
- `ChequeRecord` (via Transaction) → cheque_received, cheque_deposited, cheque_cleared, cheque_bounced
- `FeeAssignment` → fee_assigned, fee_modified
- `WaiverPenalty` → waiver_created, waiver_approved, waiver_rejected, penalty_applied
- `Receipt` → receipt_generated
- `LedgerEntry` → refund events
- `AuditLog` (filtered by entity=student, entityId) → admin_override

Returns normalized `{ events[], summary }` shape. Events sorted by timestamp DESC.

### Edge Cases
- Missing linked records → graceful degrade with `metadata: null`
- Pagination: default 50 events, cursor-based via `?before=<timestamp>`
- Same-timestamp events: secondary sort by type priority

---

## Feature 3: AI Collections Copilot

### Architecture

No LLM required. Pure intent classification via keyword matching + existing dashboard domain services.

```
User Query → Intent Classifier (keyword map) → Analytics Engine Query → Response Builder → Chat UI
```

### Intent Mapping to Existing Services

| Intent                | Existing Service Used                          |
|-----------------------|------------------------------------------------|
| TOP_DEFAULTERS        | `domain/dashboard/defaulters.js` → getDefaulterData() |
| TODAY_COLLECTION      | `domain/dashboard/metrics.js` → getMetricsData()      |
| REVENUE_BREAKDOWN     | `domain/dashboard/revenue.js` → getRevenueData()      |
| PENDING_DUES          | `domain/dashboard/reports.js` → getReportData()       |
| PAYMENT_METHODS       | NEW: aggregate Transactions by method           |
| COLLECTION_TREND      | NEW: compare month-over-month from Transactions |
| PENDING_WAIVERS       | Direct Prisma query on WaiverPenalty(status=pending) |
| CHEQUE_RISK           | Direct Prisma query on ChequeRecord patterns    |
| CASHIER_PERFORMANCE   | NEW: aggregate Transactions by actorId (via AuditLog) |
| CLASS_WISE_ANALYSIS   | Extends getDefaulterData with class grouping     |

### Backend

```
POST /api/copilot/query
Body: { query: "which class has the highest pending dues?" }
Response: {
  intent, answer, data[], chart?, sourceNote
}
```

### Safety
- Unrecognized intent → "I can help with: [list of supported queries]"
- Every answer includes `sourceNote`
- Rate limit: 10 queries/min per admin (use existing express-rate-limit)

---

## Feature 4: Offline Sync Queue with Conflict Resolution

### What Changes From Current Code

**Current** (`offlineSyncService.js`): Simple loop, catches errors with generic conflict/failed.  
**New**: Proper duplicate detection before insert + conflict resolution actions.

### Conflict Detection Logic (Server-Side)

Before calling `collectCash`/`collectCheque`, check:
1. Idempotency key already exists → return `already_synced`
2. Same student + same amount + same day exists → return `conflict` with candidate txn details
3. Fee assignment already paid → return `already_paid`

### Response Shape

```json
{
  "results": [
    { "localId": "abc", "status": "synced", "transactionId": "txn_123" },
    { "localId": "def", "status": "conflict", "reason": "Duplicate: matches Txn#456",
      "candidateTransactionId": 456, "actions": ["keep_both", "skip", "replace"] },
    { "localId": "ghi", "status": "failed", "reason": "Student not found" }
  ]
}
```

### Conflict Resolution Endpoint

```
POST /api/payments/offline/resolve-conflict
Body: { localId, action: "keep_both" | "skip" | "replace", idempotencyKey }
```

### Frontend Changes to OfflineQueue.jsx
- Add "Conflicts" tab showing items needing resolution
- State machine per item: `waiting → uploading → synced | conflict | failed`
- `updatePaymentInQueue()` from existing `idb.js` used to track local status

---

## Cross-Page Sync Strategy

All 3 role dashboards (admin, cashier, guardian) share data consistency:

1. **Admin Dashboard** auto-refreshes via existing `useDashboardQuery` (5s polling)
2. **Reconciliation** → on approve/reject, call `refetch()` on dashboard metrics
3. **Offline Queue** → on sync complete, invalidate dashboard metrics
4. **Timeline** → read-only, no cross-sync needed
5. **Copilot** → queries live data, always fresh

### DB Consistency Rules
- All reconciliation approve/reject wrapped in `prisma.$transaction()`
- All offline conflict resolution wrapped in `prisma.$transaction()`
- Audit logs created inside the same transaction (not fire-and-forget)
- Receipt sequence uses `prisma.$transaction()` for atomic increment (already implemented)

---

## Build Order

| Phase | Feature                        | Files Modified/Created                     |
|-------|--------------------------------|--------------------------------------------|
| 0     | Schema migration + shared types| `schema.prisma`, new migration, seed update |
| 1     | Smart Reconciliation           | `matcher.js`, `reconciliation.js` controller, `Reconciliation.jsx`, new components |
| 2     | Student Audit Timeline         | New `timeline.js` domain, new controller, new `Timeline.jsx` page |
| 3     | Offline Sync + Conflict        | `offlineSyncService.js`, `payments.js` controller, `OfflineQueue.jsx` |
| 4     | AI Collections Copilot         | New `copilot/` domain, new controller, new `CopilotPanel.jsx` |
| 5     | Polish + Seed Data             | `seed.js`, CSS additions, empty states     |

---

## Reusable Components (existing)
- `GlassCard` / `frosted-glass-card` — metrics cards
- `StatusBadge` — event status indicators
- `EmptyState` / `ErrorState` — loading and empty states
- `RevenueChart` — reused for copilot chart responses
- `useDashboardQuery` — polling hook
- `idb.js` utilities — IndexedDB queue management

## New Components Needed
- `ReconciliationReviewDrawer` — side-by-side match review
- `TimelineVertical` — vertical timeline layout with event dots
- `CopilotPanel` — chat side panel with quick prompts
- `CopilotMessage` — user/assistant message bubble
- `ConflictResolutionCard` — offline conflict display
- `ConfidenceBadge` — color-coded confidence % indicator

## Testing Strategy

### Unit Tests
- Matching engine: score calculation for all criteria, threshold boundaries
- Timeline aggregation: correct ordering, type filtering, summary math
- Copilot intent classification: all 11 intents + unknown fallback
- Offline conflict detection: duplicate detection, idempotency

### Integration Tests
- Reconciliation upload → match → approve flow
- Timeline endpoint with seeded data
- Copilot query against real database state

### Demo Script (2 min per feature)
1. **Reconciliation**: Upload CSV → watch auto-match → review uncertain → approve
2. **Timeline**: Open student → see complete timeline → filter → click event drawer
3. **Offline Queue**: Go offline → collect cash → go online → sync → resolve conflict
4. **Copilot**: Ask "Top defaulters" → see table → ask "Compare this month vs last"
