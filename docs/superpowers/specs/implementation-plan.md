# Implementation Plan — Analytics & Operations Features

## Pre-Implementation Context

**Monorepo**: pnpm workspace with `apps/api` (Express+Prisma) and `apps/web` (Vite+React+Zustand)
**DB**: PostgreSQL via Prisma ORM at `apps/api/prisma/schema.prisma`
**Auth**: JWT + RBAC middleware at `src/middlewares/rbac.js` — `authenticate` + `checkRole([])`
**Audit**: `src/middlewares/audit.js` — `logAudit()` and `auditLogger()` middleware
**Errors**: `src/errors/AppError.js` — `AppError`, `ValidationError`, `NotFoundError`
**Frontend API**: `src/api/client.js` — axios instance `api` with baseURL `/api`
**State**: Zustand store at `src/stores/authStore.js`
**Routing**: Hash-based via `useState('page')` in `App.jsx` — `setPage()` + tab state per role
**Polling**: `src/hooks/useDashboardQuery.js` — auto-refresh hook with 5s interval
**CSS**: `src/index.css` — glassmorphism dark theme, Outfit font, `.glass-panel`, `.btn`, `.badge-*`
**Offline**: `src/utils/idb.js` — IndexedDB queue with idempotency_key as keyPath

---

## PHASE 0: Schema Migration + Shared Helpers

### Step 0.1: Update Prisma Schema

**File**: `apps/api/prisma/schema.prisma`

Add to `ReconciliationItem` model:
- `bankDescription String? @map("bank_description") @db.VarChar(255)`
- `confidence Int? @default(0)`
- `matchExplanation String? @map("match_explanation") @db.Text`
- `resolvedById Int? @map("resolved_by_id")`
- `resolvedAt DateTime? @map("resolved_at") @db.Timestamp()`

Add to `ReconciliationBatch` model:
- `totalRows Int @default(0) @map("total_rows")`
- `autoMatched Int @default(0) @map("auto_matched")`
- `needsReview Int @default(0) @map("needs_review")`
- `unmatchedCount Int @default(0) @map("unmatched_count")`

### Step 0.2: Run Migration
```bash
cd apps/api && npx prisma migrate dev --name add_recon_confidence
npx prisma generate
```

### Step 0.3: Create Analytics Engine

**Create**: `apps/api/src/domain/analytics/analyticsEngine.js`

Wraps existing dashboard services + adds new query functions:
- `getTodayCollection()` — from `getMetricsData()`
- `getTopDefaulters(limit)` — from `getDefaulterData('risk')`
- `getRevenueBreakdown(period)` — from `getRevenueData(period)`
- `getPendingDues(classFilter)` — from `getReportData(classFilter)`
- `getPaymentMethodBreakdown()` — NEW: `prisma.transaction.groupBy` by method
- `getCollectionTrend()` — NEW: compare last 2 months
- `getPendingWaivers()` — NEW: query WaiverPenalty status=pending
- `getChequeRisk()` — NEW: ChequeRecord with deposit_pending/bank_pending
- `getCashierPerformance()` — NEW: aggregate AuditLog by actorId for collect actions
- `getClassWiseAnalysis()` — NEW: group FeeAssignment by student.class

---

## PHASE 1: Smart Reconciliation Autopilot

### Step 1.1: Rewrite Matching Engine

**File**: `apps/api/src/domain/reconciliation/matcher.js`

Keep `parseStatementCsv()` but support 4-column CSV (date,amount,reference,description).

Add `scoreMatch(row, transaction)` function with weighted criteria:
- Amount match: 40pts (exact=40, ±₹100=30)
- Date proximity: 25pts (same day=25, ±1d=20, ±3d=10, ±7d=5)
- Reference/UTR: 20pts (exact=20, partial=10)
- Payment mode hint: 10pts (match description to method)
- Student hint: 5pts (name found in reference)

New `matchStatementRows()`: score all rows vs all txns, greedy highest-score-first assignment, classify by threshold (≥90 auto_matched, 60-89 needs_review, <60 unmatched).

### Step 1.2: Update Reconciliation Controller

**File**: `apps/api/src/controllers/reconciliation.js`

Replace `uploadStatement` and add:
- `getBatch(req,res,next)` — GET /:id with items + matched transaction details
- `resolveItem(req,res,next)` — PUT /item/:id with action approve/reject/override, in $transaction with audit log
- `bulkAction(req,res,next)` — POST /bulk-action with itemIds + action
- `getHistory(req,res,next)` — GET /history listing past batches

### Step 1.3: Register Routes

**File**: `apps/api/src/index.js` — After existing reconciliation route (~line 291):
```js
app.get('/api/reconciliation/history', authenticate, checkRole(['admin','cashier']), reconController.getHistory);
app.get('/api/reconciliation/:id', authenticate, checkRole(['admin','cashier']), reconController.getBatch);
app.put('/api/reconciliation/item/:id', authenticate, checkRole(['admin','cashier']), reconController.resolveItem);
app.post('/api/reconciliation/bulk-action', authenticate, checkRole(['admin','cashier']), reconController.bulkAction);
```

### Step 1.4: Rewrite Reconciliation.jsx

**File**: `apps/web/src/pages/admin/Reconciliation.jsx`

Full rewrite with: summary bar (4 stat cards), filter bar, results table with confidence badges, review drawer (side panel), batch history section, bulk action bar. Use `api` from client.js.

### Step 1.5: Create ReconciliationReviewDrawer

**Create**: `apps/web/src/components/common/ReconciliationReviewDrawer.jsx`

Right-side panel (450px) with bank entry vs transaction comparison, confidence bar, explanation text, action buttons.

---

## PHASE 2: Student Audit Timeline

### Step 2.1: Create Timeline Service

**Create**: `apps/api/src/domain/timeline/timelineService.js`

`getStudentTimeline(studentId, { types, from, to, limit, before })`:
- Parallel query: Transaction+ChequeRecord, FeeAssignment, WaiverPenalty, LedgerEntry, AuditLog
- Normalize each into `{ id, timestamp, type, title, amount, status, sourceId, sourceTable, metadata }`
- Merge, sort DESC, filter, paginate
- Compute summary: `{ totalPaid, totalPending, totalWaived, totalPenalized, lastPaymentDate }`

### Step 2.2: Create Timeline Controller

**Create**: `apps/api/src/controllers/timeline.js`

Handler: validate studentId, guardian access check (guardianId match), call service, return `{ events, summary }`.

### Step 2.3: Register Route

**File**: `apps/api/src/index.js` — After KYC routes (~line 202):
```js
const timelineController = require('./controllers/timeline');
app.get('/api/students/:id/timeline', authenticate, checkRole(['admin','cashier','guardian']), timelineController.getTimeline);
```

### Step 2.4: Create Timeline Page

**Create**: `apps/web/src/pages/admin/Timeline.jsx`

Student selector dropdown, summary cards row, filter chips (All|Payments|Penalties|Waivers|Cheques), vertical timeline with colored dots, expandable event cards, "Load More" pagination.

### Step 2.5: Create TimelineVertical Component

**Create**: `apps/web/src/components/common/TimelineVertical.jsx`

Props: `events[], onEventClick`. CSS pseudo-elements for vertical connecting line.

### Step 2.6: Wire Navigation

**File**: `apps/web/src/components/layout/RoleNav.jsx` — Add `['timeline', 'Timeline']` to admin tabs
**File**: `apps/web/src/App.jsx` — Import Timeline, add `{adminTab === 'timeline' && <Timeline />}` after line 391

---

## PHASE 3: Offline Sync + Conflict Resolution

### Step 3.1: Enhance offlineSyncService.js

**File**: `apps/api/src/domain/payments/offlineSyncService.js`

Add conflict detection before payment processing:
1. Idempotency check → `already_synced`
2. Duplicate check (same student + amount + day) → `conflict` with candidate txn details + actions
3. Assignment already paid → `already_paid`
4. Otherwise process normally → `synced`

### Step 3.2: Add resolveConflict Controller

**File**: `apps/api/src/controllers/payments.js`

New handler `resolveConflict`: accepts `{ localId, action: 'keep_both'|'skip', idempotencyKey, ... }`. Wrapped in `$transaction()` with audit log.

### Step 3.3: Register Route

**File**: `apps/api/src/index.js` — After line 255:
```js
app.post('/api/payments/offline/resolve-conflict', authenticate, checkRole(['admin','cashier']), paymentsController.resolveConflict);
```

### Step 3.4: Update OfflineQueue.jsx

**File**: `apps/web/src/pages/cashier/OfflineQueue.jsx`

Add tab bar (Pending|Conflicts|Synced), per-item sync status badges, conflict cards with action buttons (Keep Both|Skip), use `api` from client.js instead of raw `fetch()`.

---

## PHASE 4: AI Collections Copilot

### Step 4.1: Create Intent Classifier

**Create**: `apps/api/src/domain/copilot/intentClassifier.js`

Keyword-based mapping of 11 intents (TOP_DEFAULTERS, TODAY_COLLECTION, REVENUE_BREAKDOWN, PENDING_DUES, PAYMENT_METHODS, COLLECTION_TREND, PENDING_WAIVERS, CHEQUE_RISK, CASHIER_PERFORMANCE, CLASS_WISE_ANALYSIS, UNKNOWN).

### Step 4.2: Create Copilot Service

**Create**: `apps/api/src/domain/copilot/copilotService.js`

`processQuery(query)`: classify intent → call analytics engine → format answer string → build optional chart payload → return `{ intent, answer, data, chart, sourceNote }`. Unknown → helpful fallback message listing supported queries.

### Step 4.3: Create Copilot Controller

**Create**: `apps/api/src/controllers/copilot.js`

Single handler validating `req.body.query`, calling service, returning response.

### Step 4.4: Register Route

**File**: `apps/api/src/index.js`
```js
const copilotController = require('./controllers/copilot');
const copilotLimiter = rateLimit({ windowMs: 60000, max: 10 });
app.post('/api/copilot/query', authenticate, checkRole(['admin']), copilotLimiter, copilotController.processQuery);
```

### Step 4.5: Create CopilotPanel Component

**Create**: `apps/web/src/components/common/CopilotPanel.jsx`

Fixed right panel (400px), chat interface with: quick prompt chips, scrollable messages area, text input + send, inline Recharts charts when response has chart data, compact data tables, sourceNote display, typing indicator animation.

### Step 4.6: Create CopilotMessage Component

**Create**: `apps/web/src/components/common/CopilotMessage.jsx`

### Step 4.7: Wire into Dashboard

**File**: `apps/web/src/pages/admin/Dashboard.jsx` — Add FAB button + CopilotPanel with open/close state.

### Step 4.8: Add Copilot CSS

**File**: `apps/web/src/index.css` — `.copilot-fab`, `.copilot-panel`, `.copilot-message-*`, `.copilot-chip`, typing animation.

---

## PHASE 5: Polish + Seed + Testing

### Step 5.1: Update seed.js
Add 5+ students across classes, mixed fee assignments, transactions, cheque records, waivers.

### Step 5.2: Add CSS for new components
Timeline styles, confidence badges, review drawer, conflict cards, summary stat cards.

### Step 5.3: Empty states & loading
Every new page: loading skeleton, EmptyState, ErrorState.

### Step 5.4: Cross-page sync verification
- Cashier collects → admin dashboard updates in 5s
- Reconciliation approve → transaction status updates → metrics refresh
- Offline conflict resolve → dashboard updates
- Copilot returns live data matching dashboard

---

## 10 Critical Implementation Rules

1. **Every DB mutation** in `prisma.$transaction()` — no partial writes
2. **Every mutation endpoint** creates `AuditLog` inside same transaction
3. **All routes** use `authenticate` + `checkRole()` middleware
4. **All controllers** use try/catch + `next(err)` pattern
5. **All services** use `AppError` classes from `src/errors/AppError.js`
6. **Frontend uses `api` from `src/api/client.js`** — never raw fetch/axios
7. **New admin tabs** added to BOTH `RoleNav.jsx` AND `App.jsx`
8. **Confidence scores** stored as integers 0-100, never recalculated on read
9. **Timeline is read-only** — no mutations, no audit logging
10. **Copilot has no LLM dependency** — pure keyword classification + DB queries
