# Task 9: Frontend API Consistency Audit

## Files Audited

### 1. `apps/web/src/pages/auth/Signup.jsx`
- **Status:** OK (as-is, per brief)
- Uses `axios.post('/api/auth/signup', ...)` — public signup endpoint
- Also uses `axios.post('/api/students/kyc', ...)` with manual `Authorization` header (part of signup flow)
- **Action:** None required

### 2. `apps/web/src/pages/guardian/PaymentSuccess.jsx`
- **Status:** OK (as-is, per brief)
- Uses `axios.get('/api/payments/verify?order_id=...')` — public payment verification callback
- Uses `axios.get('/api/payments/receipt?transaction_id=...')` — public receipt download
- **Action:** None required

### 3. `apps/web/src/pages/cashier/Collections.jsx`
- **Status:** Dead import — does NOT use axios at all
- Imports `axios from 'axios'` (line 2) but all API calls use native `fetch()` with manual `Authorization` headers
- Makes authenticated calls via `fetch()` for students roster, fee assignments, and payment recording
- **Action:** None required (no axios calls to swap). The import is dead code.

## Broader Scan: All Files Using Bare `axios`

### Clean (no auth issues)
- `Signup.jsx` — public signup endpoint (per brief, OK as-is)
- `PaymentSuccess.jsx` — public payment callbacks (per brief, OK as-is)

### Using bare axios with manual auth headers (non-standard but functional)
- `Approvals.jsx` — all calls use `axios.get/post(url, { headers: { Authorization: `Bearer ${token}` } })` with manual token from localStorage
- `PaymentButton.jsx` — all calls use `axios.post(url, body, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })`
- `Dashboard.jsx` — all calls use manual `Authorization` header pattern
- `Receipts.jsx` — authenticated calls with manual headers
- `FeeSetup.jsx` — all calls with manual `Authorization` headers
- `useDashboardQuery.js` — uses `axios.get()` with manual `Authorization` header

### Missing auth headers on authenticated calls (BUGS)
- **`App.jsx` lines 65, 74:** `axios.get('/api/admin/cashiers')` and `axios.get('/api/admin/audit-logs')` — admin-only endpoints, but no auth header is passed. These rely on `axios.defaults.headers.common.Authorization` being set elsewhere (fragile).
- **`Payment.jsx` lines 16, 36, 51:** `axios.get('/api/guardians/students')`, `axios.get('/api/fees/assignments?studentId=...')`, `axios.get('/api/payments/transactions')` — no auth headers passed. These endpoints require authentication.

### Collections.jsx specific
- `Collections.jsx` uses `fetch()` (not axios) for all API calls. The `axios` import is dead code. Would benefit from switching to the shared `api` instance, but that requires rewriting all fetch calls.

## Summary

| File | Bare axios? | Auth header? | Recommended fix |
|------|-------------|--------------|-----------------|
| Signup.jsx | Yes | Manual for KYC | None (per brief) |
| PaymentSuccess.jsx | Yes | N/A (public) | None (per brief) |
| Collections.jsx | Dead import | N/A (uses fetch) | Remove dead import |
| App.jsx | Yes | **Missing** for cashiers/audit-logs | Swap to `api` instance |
| Payment.jsx | Yes | **Missing** for all calls | Swap to `api` instance |
| Approvals.jsx | Yes | Manual | Swap to `api` instance |
| PaymentButton.jsx | Yes | Manual | Swap to `api` instance |
| Dashboard.jsx | Yes | Manual | Swap to `api` instance |
| Receipts.jsx | Yes | Manual | Swap to `api` instance |
| FeeSetup.jsx | Yes | Manual | Swap to `api` instance |
| useDashboardQuery.js | Yes | Manual | Swap to `api` instance |

## Conclusions

1. **Signup.jsx** and **PaymentSuccess.jsx** are OK as-is (public endpoints).
2. **Collections.jsx** has a dead `axios` import but makes no axios calls; all API calls use `fetch()`.
3. **Two bugs found**: `App.jsx` and `Payment.jsx` make authenticated calls without passing auth headers on bare axios.
4. **6 other files** use bare axios with manual auth headers — functional but inconsistent with the project's shared `api` instance pattern.
