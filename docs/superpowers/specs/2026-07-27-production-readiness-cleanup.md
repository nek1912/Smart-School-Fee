# Production Readiness: Codebase Cleanup Phase

## Objective
Clean up the MVP codebase to a maintainable production-grade structure before fixing bugs and deploying.

## Scope

### 1. Prisma Schema Consolidation
- **Issue**: Two schema files exist — `apps/api/prisma/schema.prisma` and `prisma/schema.prisma`
- **Fix**: Keep `apps/api/prisma/schema.prisma` as the single source of truth. Remove the root `prisma/` directory. Update any references in the root `package.json` to point to the API schema.
- The root `prisma/` likely exists from an earlier setup and is unused by the API.

### 2. Frontend API Consistency
- **Done**: Most files already migrated to use shared `api` instance from `client.js`
- **Remaining**: Audit any remaining bare `axios` imports. `Signup.jsx` and `PaymentSuccess.jsx` use bare `axios` for public endpoints (signup, payment verify) — leave these as-is since they don't need auth. Swap any that make authenticated calls.

### 3. Centralized Error Handling Middleware
- **Issue**: Every controller has `try/catch` with `console.error` + `res.status(500).json({ error: 'Internal server error' })` — repetitive, no structured error format.
- **Fix**: 
  - Create `apps/api/src/middlewares/errorHandler.js`
  - Define custom `AppError` class with status code, message, and optional details
  - Controllers throw errors instead of catching; errors propagate to the middleware
  - Middleware catches all errors, logs structuredly (with request ID if available), returns consistent JSON
  - Handle Prisma errors (e.g., P2002 unique constraint, P2025 not found) with appropriate HTTP codes

### 4. Seed Script Idempotency
- **Issue**: `seed.js` clears all tables with `deleteMany` on every run — destructive and slow
- **Fix**: Use `upsert` with unique identifiers (mobile for users, name+class for students) so the seed can be run multiple times without data loss. Only insert if not exists.

### 5. Dead Code Scan
- Scan for: unused imports, unused components, unreachable routes, commented-out code blocks, orphaned utility files.
- Remove or archive anything unused.

### 6. Environment Config Validation
- **Issue**: `config/env.js` does some validation but is not exhaustive
- **Fix**: Validate all required env vars at startup. Fail fast with a clear message. Required: `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `FRONTEND_URL`. Optional but warned: `CASHFREE_*`, `PORT`.

### 7. Controller Refactoring
- **Issue**: `controllers/dashboard.js` (324 lines), `controllers/auth.js` (511 lines), `controllers/fee.js` (279 lines) are large and mix concerns
- **Fix**: 
  - Extract business logic into `domain/` service files
  - Keep controllers thin — only request parsing, validation, response sending
  - Dashboard: split metrics, revenue, defaulters, reports into separate service files
  - Auth: extract OTP logic, token generation into domain services
  - Fee: extract penalty logic, assignment logic into domain services

### 8. CSS/Style Consolidation
- **Issue**: Styles are a mix of inline styles, a global CSS file, and glass-panel/frosted-glass-card class patterns
- **Fix**: 
  - Audit the global CSS (`apps/web/src/index.css` or equivalent) for unused rules and remove them
  - Extract repeated inline style combinations (e.g., glass-panel shadow/border combos) into reusable CSS utility classes
  - Move layout primitives (flex, grid gaps, padding) to CSS classes; keep inline styles only for truly dynamic values (theme colors, conditional widths)
  - Standardize on a single approach: CSS classes for all static styling, inline only for runtime values

## Non-Goals
- No new features
- No database schema changes (only seed script changes)
- No deployment configuration (deferred to later phase)

## Success Criteria
- `pnpm --filter smart-school-api test` passes
- `pnpm --filter web build` passes
- App runs locally without new warnings
- Seed script can run multiple times without error
- All API errors return a consistent JSON shape
- Controllers are under ~150 lines each (logic extracted to services)
