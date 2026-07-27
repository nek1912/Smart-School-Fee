# Codebase Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up the MVP codebase to a maintainable production-grade structure.

**Architecture:** Consolidate duplicate configs, centralize error handling (already exists but unused), extract business logic from fat controllers into domain services, make seed script idempotent, and unify styling approach.

**Tech Stack:** Node.js/Express backend, React/Vite frontend, Prisma ORM, PostgreSQL

## Global Constraints
- Prisma schema: keep `apps/api/prisma/schema.prisma` as single source, remove root `prisma/`
- Backend error responses: consistent `{ error, requestId }` shape via existing `errorHandler` middleware
- Seed script: use `upsert` for idempotency, never `deleteMany`
- Frontend API: use shared `api` instance for all authenticated calls (except public endpoints like signup/payment-verify)

---

### Task 1: Prisma Schema Consolidation + Environment Config

**Files:**
- Delete: `prisma/schema.prisma` (root)
- Modify: `apps/api/src/config/env.js` (enhance validation)
- Check: `scripts/verify-production-readiness.js` (update if it references root prisma)

- [ ] **Delete root Prisma schema**

```bash
Remove-Item -LiteralPath "D:\Smart-School-Fee\prisma\schema.prisma" -ErrorAction SilentlyContinue
# Check if root prisma directory has other files
Get-ChildItem -LiteralPath "D:\Smart-School-Fee\prisma"
# If empty, remove directory
Remove-Item -LiteralPath "D:\Smart-School-Fee\prisma" -ErrorAction SilentlyContinue
```

- [ ] **Update `apps/api/src/config/env.js` to validate at startup**

Add validation for `FRONTEND_URL` (required in production) and warn about missing Cashfree vars:

```js
const readEnv = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

const warnEnv = (name) => {
  if (!process.env[name]) {
    console.warn(`[config] WARNING: ${name} is not set — using fallback or disabled`);
  }
};

const getConfig = () => {
  const nodeEnv = readEnv('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const jwtSecret = readEnv('JWT_SECRET', isProduction ? undefined : DEFAULT_DEV_JWT_SECRET);
  const encryptionKey = readEnv('ENCRYPTION_KEY', isProduction ? undefined : DEFAULT_DEV_ENCRYPTION_KEY);
  const databaseUrl = readEnv('DATABASE_URL');
  const frontendUrl = readEnv('FRONTEND_URL', 'http://localhost:3000');

  if (isProduction && !jwtSecret) throw new Error('JWT_SECRET is required in production');
  if (isProduction && !encryptionKey) throw new Error('ENCRYPTION_KEY is required in production');
  if (isProduction && !frontendUrl) throw new Error('FRONTEND_URL is required in production');
  if (encryptionKey && encryptionKey.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  if (!isProduction) {
    warnEnv('CASHFREE_CLIENT_ID');
    warnEnv('CASHFREE_CLIENT_SECRET');
    warnEnv('CASHFREE_WEBHOOK_SECRET');
  }

  return {
    nodeEnv,
    port: Number(readEnv('PORT', '5000')),
    jwtSecret,
    encryptionKey,
    databaseUrl,
    frontendUrl
  };
};
```

- [ ] **Update `scripts/verify-production-readiness.js`** if it references root prisma path. Read the file to check.

Read: `scripts/verify-production-readiness.js`
Fix any root-prisma references to point to `apps/api/prisma/`.

- [ ] **Commit**

```bash
git add apps/api/src/config/env.js scripts/ scripts/
git commit -m "chore: consolidate prisma schema, enhance env validation"
```

---

### Task 2: Dead Code Scan

**Files:** Scan the entire codebase

- [ ] **Scan for unused files and imports**

Use grep to find:
1. Unused component imports in frontend
2. Unused controller exports in backend
3. Orphaned utility files
4. Large commented-out code blocks

Check commands:
```bash
# Find commented-out blocks (> 5 consecutive commented lines)
rg -U '^\s*//\s*\n^\s*//\s*' --multiline-dotall -g '*.{js,jsx}' apps/web/src | head -20

# Check for unused route handlers
rg 'router\.(get|post|put|delete)\(' apps/api/src/index.js

# Find files in controllers but not imported in index.js
$used = Select-String -Path "apps\api\src\index.js" -Pattern "require\('\./controllers/\w+" | ForEach-Object { $_ -replace ".*require\('\./controllers/","" -replace "'\).*","" }
Get-ChildItem "apps\api\src\controllers\*.js" | ForEach-Object { if ($used -notcontains $_.BaseName) { Write-Host "UNUSED: $($_.Name)" } }
```

- [ ] **Remove or archive identified dead code**

Clean up based on findings. No code changes beyond removals.

- [ ] **Commit**

```bash
git add -A
git commit -m "chore: remove dead code"
```

---

### Task 3: Seed Script Idempotency

**Files:**
- Modify: `apps/api/prisma/seed.js`

- [ ] **Read current seed script**

Read: `apps/api/prisma/seed.js`

- [ ] **Rewrite seed to use upsert instead of deleteMany**

Replace the destructive `deleteMany` with `upsert` on unique identifiers (mobile for guardians, name+class for students). Structure:

```js
const upsertGuardian = async (prisma, data) => {
  return prisma.guardian.upsert({
    where: { mobile: data.mobile },
    update: data,  // update if exists
    create: data   // create if not
  });
};
```

The seed should:
1. Upsert guardians (admin, cashier, parent) by `mobile`
2. Upsert fee structures by `name` + `type`
3. Upsert students by `name` + `class`
4. Upsert fee assignments by `studentId` + `feeStructureId`
5. Upsert transactions with idempotency key or receipt number
6. Skip seed if data already exists (idempotent)

- [ ] **Run seed to verify idempotency**

```bash
cd apps/api && npx prisma db seed
# Run again — should produce no errors
npx prisma db seed
```

- [ ] **Commit**

```bash
git add apps/api/prisma/seed.js
git commit -m "refactor: make seed script idempotent with upsert"
```

---

### Task 4: Centralized Error Handling

**Files:**
- Modify: `apps/api/src/middlewares/errorHandler.js` (add Prisma error mapping, structured logging)
- Modify: All controller files (remove try/catch, use `next(err)` or throw)
- Create: `apps/api/src/errors/AppError.js` (custom error class)

- [ ] **Create `AppError` class**

Create `apps/api/src/errors/AppError.js`:

```js
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

module.exports = { AppError, NotFoundError, ValidationError, UnauthorizedError };
```

- [ ] **Enhance error handler middleware**

Modify `apps/api/src/middlewares/errorHandler.js`:

```js
const { Prisma } = require('@prisma/client');

const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    requestId: req.requestId
  });
};

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return res.status(409).json({
          error: 'A record with this value already exists',
          requestId: req.requestId
        });
      case 'P2025':
        return res.status(404).json({
          error: 'Record not found',
          requestId: req.requestId
        });
      case 'P2021':
        return res.status(500).json({
          error: 'Database schema mismatch — run migrations',
          requestId: req.requestId
        });
      default:
        console.error(`[PrismaError] ${err.code}:`, err.message);
    }
  }

  // Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      error: 'Invalid data provided',
      requestId: req.requestId
    });
  }

  // Custom AppError
  const status = Number(err.statusCode || err.status || 500);
  const message = err.isOperational ? err.message : 'Internal server error';

  if (!err.isOperational) {
    console.error(`[Error] ${req.method} ${req.path}:`, err);
  }

  res.status(status).json({
    error: message,
    requestId: req.requestId
  });
};

module.exports = { notFoundHandler, errorHandler };
```

- [ ] **Refactor one controller as a pattern (e.g., `expenses.js` — smallest)**

Replace `try/catch` with `next(err)` pattern:

```js
const createExpense = async (req, res, next) => {
  try {
    const { description, amount, category, paymentMode } = req.body;
    if (!description || !amount) {
      throw new ValidationError('Description and amount are required');
    }
    const expense = await prisma.expense.create({
      data: { description, amount: parseFloat(amount), category, paymentMode, createdById: req.user.id }
    });
    return res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
};
```

Remove the separate `res.status(500)` catch block — just call `next(error)`.

- [ ] **Refactor all remaining controllers to use `next(err)`**

Apply the same pattern to: `auth.js`, `cheques.js`, `dashboard.js`, `fee.js`, `kyc.js`, `payments.js`, `reconciliation.js`, `refunds.js`, `waivers.js`.

- [ ] **Verify existing tests pass**

```bash
pnpm --filter smart-school-api test
```

- [ ] **Commit**

```bash
git add apps/api/src/errors/ apps/api/src/middlewares/errorHandler.js apps/api/src/controllers/
git commit -m "refactor: centralized error handling with AppError + Prisma mapping"
```

---

### Task 5: Controller Refactoring — Dashboard

**Files:**
- Create: `apps/api/src/domain/dashboard/metrics.js`
- Create: `apps/api/src/domain/dashboard/revenue.js`
- Create: `apps/api/src/domain/dashboard/defaulters.js`
- Create: `apps/api/src/domain/dashboard/reports.js`
- Modify: `apps/api/src/controllers/dashboard.js` (thin wrapper)

- [ ] **Extract metrics service**

Create `apps/api/src/domain/dashboard/metrics.js`:

```js
const prisma = require('../../config/db');

const getMetricsData = async () => {
  const [successResult, reversedResult, inHandResult, pendingAssignments, todayResult, yesterdayResult] = await Promise.all([
    prisma.transaction.aggregate({ where: { status: 'success', method: { in: ['UPI', 'CASH', 'CHEQUE'] } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { status: 'reversed' }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { method: 'CASH', depositedAt: null, status: 'success' }, _sum: { amount: true } }),
    prisma.feeAssignment.findMany({ where: { status: { in: ['pending', 'overdue'] } }, include: { feeStructure: true, waiverPenalties: { where: { status: 'approved' } } } }),
    prisma.transaction.aggregate({ where: { status: 'success', createdAt: { gte: (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })() } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { status: 'success', createdAt: { gte: (() => { const d = new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); return d; })(), lt: (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })() } }, _sum: { amount: true } })
  ]);

  const bankBalance = Number(successResult._sum.amount || 0) + Number(reversedResult._sum.amount || 0);
  const inHandCash = Number(inHandResult._sum.amount || 0);
  let pendingFees = 0;
  pendingAssignments.forEach(item => {
    let amt = Number(item.feeStructure.amount);
    item.waiverPenalties.forEach(wp => {
      if (wp.type === 'penalty') amt += Number(wp.amount);
      else if (wp.type === 'waiver') amt -= Number(wp.amount);
    });
    pendingFees += amt;
  });

  const todayCollections = Number(todayResult._sum.amount || 0);
  const yesterdayCollections = Number(yesterdayResult._sum.amount || 0);
  const collectionGrowth = yesterdayCollections > 0 ? ((todayCollections - yesterdayCollections) / yesterdayCollections * 100).toFixed(1) : '0';

  return { bankBalance, inHandCash, pendingFees, todayCollections, collectionGrowth };
};

module.exports = { getMetricsData };
```

- [ ] **Extract revenue service**

Create `apps/api/src/domain/dashboard/revenue.js`:

```js
const prisma = require('../../config/db');

const getRevenueData = async (period, classFilter) => {
  const now = new Date();
  let startDate;
  switch (period) {
    case 'daily': startDate = new Date(now.setHours(0,0,0,0)); break;
    case 'weekly': startDate = new Date(now.setDate(now.getDate()-7)); break;
    case 'monthly': default: startDate = new Date(now.setMonth(now.getMonth()-1)); break;
  }

  const where = { status: 'success', createdAt: { gte: startDate } };
  if (classFilter) where.student = { class: classFilter };

  const txs = await prisma.transaction.findMany({
    where,
    include: { feeAssignment: { include: { feeStructure: true } } }
  });

  const breakdownObj = {};
  txs.forEach(t => {
    const type = t.feeAssignment.feeStructure.type;
    breakdownObj[type] = (breakdownObj[type] || 0) + Number(t.amount);
  });

  const labels = Object.keys(breakdownObj);
  const data = Object.values(breakdownObj);

  return { labels, data };
};

module.exports = { getRevenueData };
```

- [ ] **Extract defaulters service**

Create `apps/api/src/domain/dashboard/defaulters.js`:

```js
const prisma = require('../../config/db');

const getDefaulterData = async (sortBy, classFilter) => {
  const where = { status: { in: ['pending', 'overdue'] } };
  if (classFilter) where.student = { class: classFilter };

  const assignments = await prisma.feeAssignment.findMany({
    where,
    include: { student: true, feeStructure: true }
  });

  const now = new Date();
  const defaulters = assignments
    .filter(a => a.dueDate && now > new Date(a.dueDate))
    .map(a => {
      const overdueDays = Math.floor((now - new Date(a.dueDate)) / (1000 * 60 * 60 * 24));
      const overdueAmount = Number(a.feeStructure.amount);
      const riskPct = Math.min(99, Math.floor((overdueDays / 90) * 100));
      return {
        id: a.student.id,
        name: a.student.name,
        class: a.student.class,
        overdue_days: overdueDays,
        overdue_amount: overdueAmount,
        default_risk_pct: riskPct,
        guardian_name: a.student.guardian?.name || null,
        guardian_mobile: a.student.guardian?.mobile || null
      };
    });

  defaulters.sort((a, b) => {
    if (sortBy === 'days') return b.overdue_days - a.overdue_days;
    if (sortBy === 'amount') return b.overdue_amount - a.overdue_amount;
    return b.default_risk_pct - a.default_risk_pct;
  });

  return defaulters;
};

module.exports = { getDefaulterData };
```

- [ ] **Extract reports service**

Create `apps/api/src/domain/dashboard/reports.js`:

```js
const prisma = require('../../config/db');

const getReportData = async (classFilter, startDate, endDate) => {
  const txWhere = { status: 'success' };
  if (classFilter) txWhere.student = { class: classFilter };
  if (startDate && endDate) {
    txWhere.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const txs = await prisma.transaction.findMany({
    where: txWhere,
    include: { feeAssignment: { include: { feeStructure: true } } }
  });

  const totalCollected = txs.reduce((acc, curr) => acc + Number(curr.amount), 0);

  const pendingWhere = { status: { in: ['pending', 'overdue'] } };
  if (classFilter) pendingWhere.student = { class: classFilter };
  if (startDate && endDate) {
    pendingWhere.dueDate = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const pendingAssignments = await prisma.feeAssignment.findMany({
    where: pendingWhere,
    include: { feeStructure: true, waiverPenalties: { where: { status: 'approved' } } }
  });

  const totalPending = pendingAssignments.reduce((acc, item) => {
    let amt = Number(item.feeStructure.amount);
    item.waiverPenalties.forEach(wp => {
      if (wp.type === 'penalty') amt += Number(wp.amount);
      else if (wp.type === 'waiver') amt -= Number(wp.amount);
    });
    return acc + amt;
  }, 0);

  const breakdownObj = {};
  txs.forEach(t => {
    const type = t.feeAssignment.feeStructure.type;
    breakdownObj[type] = (breakdownObj[type] || 0) + Number(t.amount);
  });

  const breakdown = Object.entries(breakdownObj).map(([type, total]) => ({ type, total }));

  return { total_collected: totalCollected, total_pending: totalPending, breakdown };
};

module.exports = { getReportData };
```

- [ ] **Rewrite `controllers/dashboard.js` as thin wrapper**

```js
const prisma = require('../config/db');
const { getMetricsData } = require('../domain/dashboard/metrics');
const { getRevenueData } = require('../domain/dashboard/revenue');
const { getDefaulterData } = require('../domain/dashboard/defaulters');
const { getReportData } = require('../domain/dashboard/reports');

const getMetrics = async (req, res, next) => {
  try {
    const data = await getMetricsData();
    return res.status(200).json(data);
  } catch (err) { next(err); }
};

const getRevenueBreakdown = async (req, res, next) => {
  try {
    const { period = 'monthly', class: classFilter } = req.query;
    const data = await getRevenueData(period, classFilter);
    return res.status(200).json(data);
  } catch (err) { next(err); }
};

const getDefaulters = async (req, res, next) => {
  try {
    const { sort_by = 'risk', filter_class } = req.query;
    const data = await getDefaulterData(sort_by, filter_class);
    return res.status(200).json(data);
  } catch (err) { next(err); }
};

const getReports = async (req, res, next) => {
  try {
    const { class: classFilter, start_date, end_date } = req.query;
    const data = await getReportData(classFilter, start_date, end_date);
    return res.status(200).json(data);
  } catch (err) { next(err); }
};

module.exports = { getMetrics, getRevenueBreakdown, getDefaulters, getReports };
```

- [ ] **Commit**

```bash
git add apps/api/src/domain/dashboard/ apps/api/src/controllers/dashboard.js
git commit -m "refactor: extract dashboard domain services from controller"
```

---

### Task 6: Controller Refactoring — Auth

**Files:**
- Create: `apps/api/src/domain/auth/signup.js`
- Create: `apps/api/src/domain/auth/login.js`
- Create: `apps/api/src/domain/auth/tokens.js`
- Modify: `apps/api/src/controllers/auth.js` (thin wrapper)

- [ ] **Extract signup logic**

```js
// apps/api/src/domain/auth/signup.js
const prisma = require('../../config/db');
const bcrypt = require('bcryptjs');

const createGuardian = async (data) => {
  const { name, email, mobile, password, role = 'guardian' } = data;
  const existing = await prisma.guardian.findUnique({ where: { mobile } });
  if (existing) {
    const err = new Error('Mobile number already registered');
    err.statusCode = 409;
    throw err;
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  return prisma.guardian.create({
    data: { name, email, mobile, password: hashedPassword, role },
    select: { id: true, name: true, email: true, mobile: true, role: true, status: true, createdAt: true }
  });
};

module.exports = { createGuardian };
```

- [ ] **Extract login logic**

```js
// apps/api/src/domain/auth/login.js
const prisma = require('../../config/db');
const bcrypt = require('bcryptjs');
const { createOtpChallenge } = require('../otpService');

const authenticateWithPassword = async (mobile, password) => {
  const user = await prisma.guardian.findUnique({ where: { mobile } });
  if (!user || user.status !== 'active') {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }
  return user;
};

const verifyOtpAndGetUser = async (mobile, otp) => {
  const { verifyOtpChallenge } = require('../otpService');
  const verified = await verifyOtpChallenge(mobile, otp);
  if (!verified) {
    const err = new Error('Invalid or expired OTP');
    err.statusCode = 401;
    throw err;
  }
  const user = await prisma.guardian.findUnique({ where: { mobile } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return user;
};

module.exports = { authenticateWithPassword, verifyOtpAndGetUser };
```

- [ ] **Extract token service**

```js
// apps/api/src/domain/auth/tokens.js
const jwt = require('jsonwebtoken');
const { requireConfig } = require('../../config/env');

const generateToken = (user) => {
  const secret = requireConfig().jwtSecret;
  return jwt.sign({ id: user.id, role: user.role }, secret, { expiresIn: '24h' });
};

const verifyToken = (token) => {
  const secret = requireConfig().jwtSecret;
  return jwt.verify(token, secret);
};

module.exports = { generateToken, verifyToken };
```

- [ ] **Update the otpService path** — move `otpService.js` from `domain/auth/` to `domain/` since both auth and login domains need it, or keep it shared.

Keep `apps/api/src/domain/auth/otpService.js` and update imports accordingly.

- [ ] **Rewrite `controllers/auth.js` as thin wrapper**

Reduce to ~150 lines. Each handler:
1. Parse request body/params
2. Call domain service
3. Return response
4. Error via `next(err)`

- [ ] **Commit**

```bash
git add apps/api/src/domain/auth/ apps/api/src/controllers/auth.js
git commit -m "refactor: extract auth domain services from controller"
```

---

### Task 7: Controller Refactoring — Fee

**Files:**
- Create: `apps/api/src/domain/fees/assignments.js`
- Create: `apps/api/src/domain/fees/penalties.js`
- Create: `apps/api/src/domain/fees/structures.js`
- Modify: `apps/api/src/controllers/fee.js` (thin wrapper)

- [ ] **Extract penalty logic**

```js
// apps/api/src/domain/fees/penalties.js
const prisma = require('../../config/db');

const applyLatePenaltyIfNeeded = async (assignment) => {
  const now = new Date();
  if (assignment.status !== 'pending' && assignment.status !== 'overdue') return;
  if (now <= new Date(assignment.dueDate)) return;

  const hasPenalty = assignment.waiverPenalties?.some(wp => wp.type === 'penalty');
  if (hasPenalty) return;

  await prisma.waiverPenalty.create({
    data: {
      studentId: assignment.studentId,
      feeAssignmentId: assignment.id,
      amount: 500.00,
      type: 'penalty',
      reason: 'Late payment charge (Overdue 30 days limit)'
    }
  });

  return prisma.feeAssignment.update({
    where: { id: assignment.id },
    data: { status: 'overdue' },
    include: { student: true, feeStructure: { include: { academicYear: true } }, waiverPenalties: true }
  });
};

module.exports = { applyLatePenaltyIfNeeded };
```

- [ ] **Extract assignment logic**

```js
// apps/api/src/domain/fees/assignments.js
const prisma = require('../../config/db');
const { applyLatePenaltyIfNeeded } = require('./penalties');

const getAssignmentsForStudent = async (studentId) => {
  const assignments = await prisma.feeAssignment.findMany({
    where: { studentId: parseInt(studentId) },
    include: { student: true, feeStructure: { include: { academicYear: true } }, waiverPenalties: true }
  });

  const results = [];
  for (const a of assignments) {
    const updated = await applyLatePenaltyIfNeeded(a);
    results.push(updated || a);
  }
  return results;
};

const createAssignment = async (data, userId) => {
  return prisma.feeAssignment.create({
    data: { studentId: parseInt(data.studentId), feeStructureId: parseInt(data.feeStructureId), dueDate: new Date(data.dueDate), assignedById: userId },
    include: { student: true, feeStructure: true }
  });
};

module.exports = { getAssignmentsForStudent, createAssignment };
```

- [ ] **Extract fee structure logic**

```js
// apps/api/src/domain/fees/structures.js
const prisma = require('../../config/db');

const listStructures = () => prisma.feeStructure.findMany({ include: { academicYear: true } });

const createStructure = (data) => prisma.feeStructure.create({ data: { name: data.name, amount: parseFloat(data.amount), type: data.type, appliesTo: data.appliesTo || 'all', academicYearId: parseInt(data.academicYearId) } });

const updateStructure = (id, data) => prisma.feeStructure.update({ where: { id: parseInt(id) }, data: { name: data.name, amount: parseFloat(data.amount), type: data.type, appliesTo: data.appliesTo } });

module.exports = { listStructures, createStructure, updateStructure };
```

- [ ] **Rewrite `controllers/fee.js`** — thin wrapper calling domain services, using `next(err)`.

- [ ] **Commit**

```bash
git add apps/api/src/domain/fees/ apps/api/src/controllers/fee.js
git commit -m "refactor: extract fee domain services from controller"
```

---

### Task 8: CSS/Style Consolidation

**Files:**
- Modify: `apps/web/src/index.css` (or global stylesheet)
- Create: `apps/web/src/styles/utilities.css`
- Modify: Various components (extract inline styles to classes)

- [ ] **Audit global CSS for unused rules**

Read the global CSS file and identify rules that are no longer referenced.

- [ ] **Create utilities.css with reusable classes**

```css
/* apps/web/src/styles/utilities.css */
.layout-stack { display: flex; flex-direction: column; gap: 25px; }
.layout-stack-sm { display: flex; flex-direction: column; gap: 15px; }
.layout-row { display: flex; gap: 10px; flex-wrap: wrap; }
.layout-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
.layout-grid-2-auto { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; }

.card-panel { background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 12px; padding: 30px; }
.card-panel-compact { background: rgba(15, 23, 42, 0.2); padding: 24px; border-radius: 12px; }

.text-secondary { color: var(--text-secondary); }
.text-sm { font-size: 0.875rem; }
.text-xs { font-size: 0.75rem; }

.overflow-table { overflow-x: auto; }
.table-base { width: 100%; border-collapse: collapse; text-align: left; }
.th-base { padding: 12px 10px; font-weight: 600; }
.td-base { padding: 12px 10px; }
```

- [ ] **Extract common inline style patterns** — replace repetitive inline style objects in components with CSS classes from utilities.css

Focus on the most repetitive patterns:
- Glass panel wrappers (`className="glass-panel"`)
- Table headers/cells with identical inline styles
- Flex layout patterns

- [ ] **Commit**

```bash
git add apps/web/src/styles/ apps/web/src/index.css
git commit -m "style: consolidate CSS utilities, extract repeated inline styles"
```

---

### Task 9: Frontend API Consistency Audit

**Files:**
- Audit: `apps/web/src/pages/auth/Signup.jsx`
- Audit: `apps/web/src/pages/guardian/PaymentSuccess.jsx`
- Check: `apps/web/src/pages/cashier/Collections.jsx`

- [ ] **Verify remaining bare `axios` imports**

Check each file that still imports `axios from 'axios'`:
- `Signup.jsx` — uses `axios.post('/api/auth/signup', ...)` — public endpoint, no auth needed. OK to leave.
- `PaymentSuccess.jsx` — uses `axios.get('/api/payments/verify?order_id=...')` — public endpoint (payment verification). OK to leave.
- `Collections.jsx` — check if it makes any authenticated calls.

- [ ] **Fix any authenticated calls found**

If any of these make authenticated requests without the `api` instance, swap them.

- [ ] **Commit**

```bash
git commit -m "chore: verify frontend API call consistency"
```

---

## Self-Review Checklist

- [ ] Spec coverage: every item from the spec has a corresponding task
- [ ] No placeholders — all code blocks contain real code
- [ ] Type/function name consistency across tasks
- [ ] All file paths are exact
