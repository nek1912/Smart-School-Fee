# Production Ready School Fee Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current Smart School Fee monorepo into a production-ready, secure, DB-consistent school fee and ledger platform using the current stack.

**Architecture:** Keep React 19 + Vite + Zustand on the web and Express + Prisma + PostgreSQL on the API. Harden the backend first, move financial behavior into small domain services, then reshape the frontend around the safer APIs. The payment ledger is the source of truth; controllers only validate, authorize, call services, and serialize responses.

**Tech Stack:** React 19, Vite, Zustand, Framer Motion, Recharts, Tesseract.js, Node.js, Express, Prisma ORM, PostgreSQL, Jest, oxlint, pnpm workspaces, Docker Compose Postgres.

## Global Constraints

- Use the current stack and existing package manager: `pnpm` workspaces.
- Do not add Redis, Tailwind, shadcn/ui, Playwright, Supertest, or external queues in this plan.
- Do not copy old implementation ideas blindly; inspect current files before each task.
- Security and DB consistency are release blockers.
- Payment, receipt, deposit, waiver, penalty, refund, and reconciliation behavior must be auditable and idempotent.
- Never store raw passwords, OTPs, JWTs, bank account numbers, IFSC values, raw Aadhaar values, or full OCR payloads in audit logs.
- Keep API routes stable unless a task explicitly states a replacement route.
- Every task must end with verification commands and a commit boundary.

---

## Phase Map

Phase 1 secures the API. Phase 2 hardens the database. Phase 3 makes the payment ledger correct. Phase 4 protects API access and validation. Phase 5 makes offline collection reliable. Phase 6 persists reconciliation. Phase 7 reshapes the UI around production workflows. Phase 8 closes privacy gaps. Phase 9 adds operational readiness. Phase 10 is the release gate.

## File Structure Map

- `apps/api/src/config/env.js`: validates environment variables and exports runtime config.
- `apps/api/src/middlewares/security.js`: CORS, security headers, body limits, and request ID middleware.
- `apps/api/src/middlewares/errorHandler.js`: consistent API errors without leaking internals.
- `apps/api/src/middlewares/validate.js`: reusable request validation helpers with no new dependency.
- `apps/api/src/utils/redact.js`: audit-safe redaction for objects and scalar values.
- `apps/api/src/domain/auth/otpService.js`: DB-backed OTP challenge creation, verification, expiry, and attempt counting.
- `apps/api/src/domain/payments/receiptService.js`: atomic receipt number allocation and receipt row creation.
- `apps/api/src/domain/payments/ledgerService.js`: immutable financial ledger entries.
- `apps/api/src/domain/payments/paymentService.js`: cash, UPI, cheque, refund, waiver, and penalty state transitions.
- `apps/api/src/domain/payments/offlineSyncService.js`: bulk offline sync with per-item results.
- `apps/api/src/domain/reconciliation/matcher.js`: deterministic bank statement matching.
- `apps/api/src/domain/privacy/masking.js`: masking helpers for KYC, banking, mobile, and document data.
- `apps/web/src/api/client.js`: axios instance, auth header attachment, error normalization.
- `apps/web/src/components/layout/AppShell.jsx`: shared page shell.
- `apps/web/src/components/layout/RoleNav.jsx`: role-specific navigation.
- `apps/web/src/components/common/StatusBadge.jsx`: consistent status rendering.
- `apps/web/src/components/common/EmptyState.jsx`: consistent empty states.
- `apps/web/src/components/common/ErrorState.jsx`: consistent error states.
- `apps/web/src/components/common/ConfirmDialog.jsx`: destructive/action confirmations.

---

### Task 1: API Security Baseline

**Files:**
- Create: `apps/api/src/config/env.js`
- Create: `apps/api/src/middlewares/security.js`
- Create: `apps/api/src/middlewares/errorHandler.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/middlewares/rbac.js`
- Test: `apps/api/tests/security.test.js`

**Interfaces:**
- Produces: `getConfig(): { nodeEnv: string, port: number, jwtSecret: string, encryptionKey: string, frontendUrl: string, databaseUrl: string }`
- Produces: `requireConfig(): ReturnType<typeof getConfig>`
- Produces: `securityHeaders(req, res, next): void`
- Produces: `requestId(req, res, next): void`
- Produces: `notFoundHandler(req, res): void`
- Produces: `errorHandler(err, req, res, next): void`
- Consumes: existing Express `app`, existing `authenticate`, existing route controllers.

- [ ] **Step 1: Write failing tests for production secret enforcement**

Create `apps/api/tests/security.test.js` with:

```javascript
describe('environment security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('production rejects missing JWT_SECRET', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/smart_school';
    expect(() => require('../src/config/env').requireConfig()).toThrow('JWT_SECRET is required in production');
  });

  test('production rejects short encryption key', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-production-secret-with-at-least-32-characters';
    process.env.ENCRYPTION_KEY = 'short';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/smart_school';
    expect(() => require('../src/config/env').requireConfig()).toThrow('ENCRYPTION_KEY must be at least 32 characters');
  });

  test('development supplies explicit safe defaults', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_KEY;
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/smart_school';
    const config = require('../src/config/env').requireConfig();
    expect(config.jwtSecret).toBe('dev-only-smart-school-jwt-secret-change-before-production');
    expect(config.encryptionKey).toBe('dev-only-smart-school-encryption-key-32');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- security.test.js`

Expected: FAIL with `Cannot find module '../src/config/env'`.

- [ ] **Step 3: Create environment validation**

Create `apps/api/src/config/env.js`:

```javascript
const DEFAULT_DEV_JWT_SECRET = 'dev-only-smart-school-jwt-secret-change-before-production';
const DEFAULT_DEV_ENCRYPTION_KEY = 'dev-only-smart-school-encryption-key-32';

const readEnv = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

const getConfig = () => {
  const nodeEnv = readEnv('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const jwtSecret = readEnv('JWT_SECRET', isProduction ? undefined : DEFAULT_DEV_JWT_SECRET);
  const encryptionKey = readEnv('ENCRYPTION_KEY', isProduction ? undefined : DEFAULT_DEV_ENCRYPTION_KEY);
  const databaseUrl = readEnv('DATABASE_URL');

  if (isProduction && !jwtSecret) {
    throw new Error('JWT_SECRET is required in production');
  }
  if (isProduction && !encryptionKey) {
    throw new Error('ENCRYPTION_KEY is required in production');
  }
  if (encryptionKey && encryptionKey.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return {
    nodeEnv,
    port: Number(readEnv('PORT', '5000')),
    jwtSecret,
    encryptionKey,
    databaseUrl,
    frontendUrl: readEnv('FRONTEND_URL', 'http://localhost:3000')
  };
};

const requireConfig = () => getConfig();

module.exports = {
  getConfig,
  requireConfig
};
```

- [ ] **Step 4: Add security middleware**

Create `apps/api/src/middlewares/security.js`:

```javascript
const crypto = require('crypto');
const { requireConfig } = require('../config/env');

const requestId = (req, res, next) => {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (requireConfig().nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
};

const corsOptions = () => {
  const config = requireConfig();
  return {
    origin: config.nodeEnv === 'production' ? config.frontendUrl : true,
    credentials: true
  };
};

module.exports = {
  requestId,
  securityHeaders,
  corsOptions
};
```

Create `apps/api/src/middlewares/errorHandler.js`:

```javascript
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    requestId: req.requestId
  });
};

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err.statusCode || err.status || 500);
  const expose = status >= 400 && status < 500;
  res.status(status).json({
    error: expose ? err.message : 'Internal server error',
    requestId: req.requestId
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
```

- [ ] **Step 5: Wire security config into API startup and RBAC**

In `apps/api/src/index.js`, replace direct `PORT`, `cors()`, and unlimited JSON parsing with:

```javascript
const { requireConfig } = require('./config/env');
const { requestId, securityHeaders, corsOptions } = require('./middlewares/security');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

const config = requireConfig();
const PORT = config.port;

app.use(requestId);
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
```

At the bottom of `apps/api/src/index.js`, after all routes and before `app.listen`, add:

```javascript
app.use(notFoundHandler);
app.use(errorHandler);
```

In `apps/api/src/middlewares/rbac.js`, replace `process.env.JWT_SECRET || 'super-secret-jwt-key-2026'` with:

```javascript
const { requireConfig } = require('../config/env');
const decoded = jwt.verify(token, requireConfig().jwtSecret);
```

- [ ] **Step 6: Run verification**

Run: `pnpm --filter smart-school-api test -- security.test.js`

Expected: PASS for 3 tests.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing backend tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config/env.js apps/api/src/middlewares/security.js apps/api/src/middlewares/errorHandler.js apps/api/src/index.js apps/api/src/middlewares/rbac.js apps/api/tests/security.test.js
git commit -m "feat: harden api runtime security baseline"
```

---

### Task 2: Audit Redaction And Auth Hardening

**Files:**
- Create: `apps/api/src/utils/redact.js`
- Create: `apps/api/src/domain/auth/otpService.js`
- Modify: `apps/api/src/middlewares/audit.js`
- Modify: `apps/api/src/controllers/auth.js`
- Modify: `apps/api/prisma/schema.prisma`
- Test: `apps/api/tests/auth-security.test.js`

**Interfaces:**
- Produces: `redactForAudit(value: unknown): unknown`
- Produces: `createOtpChallenge({ mobile, intent, payload, tx }): Promise<{ otp: string, expiresAt: Date }>`
- Produces: `verifyOtpChallenge({ mobile, intent, otp, tx }): Promise<{ payload: object }>`
- Consumes: `requireConfig().jwtSecret` from Task 1.

- [ ] **Step 1: Write failing tests for audit redaction**

Create `apps/api/tests/auth-security.test.js` with:

```javascript
const { redactForAudit } = require('../src/utils/redact');

describe('audit redaction', () => {
  test('redacts sensitive fields recursively', () => {
    const value = redactForAudit({
      password: 'secret',
      token: 'jwt',
      otp: '123456',
      bankAccount: '1234567890',
      nested: { ifsc: 'HDFC0001234', docRef: '123412341234' },
      safe: 'visible'
    });

    expect(value.password).toBe('[REDACTED]');
    expect(value.token).toBe('[REDACTED]');
    expect(value.otp).toBe('[REDACTED]');
    expect(value.bankAccount).toBe('[REDACTED]');
    expect(value.nested.ifsc).toBe('[REDACTED]');
    expect(value.nested.docRef).toBe('[REDACTED]');
    expect(value.safe).toBe('visible');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- auth-security.test.js`

Expected: FAIL with `Cannot find module '../src/utils/redact'`.

- [ ] **Step 3: Create redaction utility**

Create `apps/api/src/utils/redact.js`:

```javascript
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'token',
  'authorization',
  'otp',
  'receivedOtp',
  'bankAccount',
  'ifsc',
  'docRef',
  'aadhaar',
  'rawBody',
  'ocrData'
]);

const isSensitiveKey = (key) => SENSITIVE_KEYS.has(String(key));

const redactForAudit = (value) => {
  if (Array.isArray(value)) return value.map(redactForAudit);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((acc, [key, child]) => {
    acc[key] = isSensitiveKey(key) ? '[REDACTED]' : redactForAudit(child);
    return acc;
  }, {});
};

module.exports = {
  redactForAudit
};
```

- [ ] **Step 4: Add DB-backed OTP models**

In `apps/api/prisma/schema.prisma`, add:

```prisma
model OtpChallenge {
  id          Int       @id @default(autoincrement())
  mobile      String    @db.VarChar(15)
  intent      String    @db.VarChar(40)
  otpHash     String    @map("otp_hash") @db.VarChar(255)
  payload     Json?
  attempts    Int       @default(0)
  expiresAt   DateTime  @map("expires_at") @db.Timestamp()
  consumedAt  DateTime? @map("consumed_at") @db.Timestamp()
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamp()

  @@index([mobile, intent, consumedAt])
  @@map("otp_challenges")
}

model LoginAttempt {
  id          Int       @id @default(autoincrement())
  mobile      String    @unique @db.VarChar(15)
  count       Int       @default(0)
  lockUntil   DateTime? @map("lock_until") @db.Timestamp()
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamp()

  @@map("login_attempts")
}
```

- [ ] **Step 5: Create OTP service**

Create `apps/api/src/domain/auth/otpService.js`:

```javascript
const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const createOtpChallenge = async ({ mobile, intent, payload = null, tx = prisma }) => {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await tx.otpChallenge.updateMany({
    where: { mobile, intent, consumedAt: null },
    data: { consumedAt: new Date() }
  });

  await tx.otpChallenge.create({
    data: { mobile, intent, payload, otpHash, expiresAt }
  });

  return { otp, expiresAt };
};

const verifyOtpChallenge = async ({ mobile, intent, otp, tx = prisma }) => {
  const challenge = await tx.otpChallenge.findFirst({
    where: { mobile, intent, consumedAt: null },
    orderBy: { createdAt: 'desc' }
  });

  if (!challenge) throw Object.assign(new Error('OTP not requested or expired'), { statusCode: 400 });
  if (challenge.expiresAt < new Date()) {
    await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    throw Object.assign(new Error('OTP expired'), { statusCode: 400 });
  }
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    throw Object.assign(new Error('Too many OTP attempts'), { statusCode: 423 });
  }

  const valid = await bcrypt.compare(otp, challenge.otpHash);
  if (!valid) {
    await tx.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw Object.assign(new Error('Invalid OTP code'), { statusCode: 400 });
  }

  await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  return { payload: challenge.payload || {} };
};

module.exports = {
  createOtpChallenge,
  verifyOtpChallenge
};
```

- [ ] **Step 6: Redact audit logs**

In `apps/api/src/middlewares/audit.js`, import redaction:

```javascript
const { redactForAudit } = require('../utils/redact');
```

Replace `before: req.body ? req.body : null` and `after: data ? data : null` with:

```javascript
before: req.body ? redactForAudit(req.body) : null,
after: data ? redactForAudit(data) : null
```

In `logAudit`, replace `before` and `after` assignment with:

```javascript
before: redactForAudit(before),
after: redactForAudit(after)
```

- [ ] **Step 7: Replace in-memory OTP and default JWT in auth controller**

In `apps/api/src/controllers/auth.js`, remove `otpStore`, `generateOTP`, and `JWT_SECRET` constant. Add imports:

```javascript
const { requireConfig } = require('../config/env');
const { createOtpChallenge, verifyOtpChallenge } = require('../domain/auth/otpService');
```

Replace JWT signing with:

```javascript
const token = jwt.sign({ id: newUser.id, role: newUser.role }, requireConfig().jwtSecret, { expiresIn: '24h' });
```

In login success, replace OTP store assignment with:

```javascript
const { otp } = await createOtpChallenge({
  mobile,
  intent: 'login',
  payload: { id: user.id, role: user.role }
});
```

In `verifyOTP`, replace in-memory lookup with:

```javascript
const { payload } = await verifyOtpChallenge({ mobile, intent: 'login', otp });
const user = await prisma.guardian.findUnique({ where: { id: payload.id } });
if (!user) return res.status(401).json({ error: 'Unauthorized: User not found' });
const token = jwt.sign({ id: user.id, role: user.role }, requireConfig().jwtSecret, { expiresIn: '24h' });
```

For admin/cashier signup restriction, change `allowedRoles` to public-safe behavior:

```javascript
const requestedRole = role || 'guardian';
const allowedRoles = ['guardian'];
if (!allowedRoles.includes(requestedRole)) {
  return res.status(403).json({ error: 'Staff accounts must be created by an authenticated admin' });
}
```

Then create a separate admin-only controller function in the same file. This function must not call public `signup`, because public `signup` now rejects non-guardian roles:

```javascript
const createStaff = async (req, res) => {
  try {
    const { name, mobile, email, password, role } = req.body;
    const requestedRole = role || 'cashier';

    if (!name || !mobile || !email || !password) {
      return res.status(400).json({ error: 'name, mobile, email and password are required' });
    }
    if (!['cashier', 'employee'].includes(requestedRole)) {
      return res.status(400).json({ error: 'Only cashier or employee staff accounts can be created here' });
    }

    const existingUser = await prisma.guardian.findFirst({ where: { OR: [{ mobile }, { email }] } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this mobile or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const staff = await prisma.$transaction(async (tx) => {
      const user = await tx.guardian.create({
        data: { name, mobile, email, passwordHash, role: requestedRole }
      });
      if (requestedRole === 'cashier') {
        await tx.cashier.create({
          data: { userId: user.id, createdByAdminId: req.user.id, status: 'active' }
        });
      }
      return user;
    });

    const { passwordHash: _, ...safeStaff } = staff;
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'create_staff',
      entity: 'guardian',
      entityId: staff.id,
      before: null,
      after: safeStaff
    });

    return res.status(201).json({ user: safeStaff });
  } catch (error) {
    console.error('Create staff error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

Export `createStaff` and add an admin route in `apps/api/src/index.js`:

```javascript
app.post('/api/admin/staff', authenticate, checkRole(['admin']), auditLogger('guardian', 'create_staff'), authController.createStaff);
```

- [ ] **Step 8: Run migration and tests**

Run: `pnpm --filter smart-school-api db:generate`

Expected: Prisma client generated successfully.

Run: `pnpm --filter smart-school-api test -- auth-security.test.js`

Expected: PASS redaction test.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing tests.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/utils/redact.js apps/api/src/domain/auth/otpService.js apps/api/src/middlewares/audit.js apps/api/src/controllers/auth.js apps/api/src/index.js apps/api/tests/auth-security.test.js
git commit -m "feat: add audit redaction and db backed otp"
```

---

### Task 3: Database Financial Constraints And Receipt Sequence

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.js`
- Create: `apps/api/tests/schema-rules.test.js`

**Interfaces:**
- Produces Prisma models: `ReceiptSequence`, `LedgerEntry`, `PaymentOrder`, `ReconciliationBatch`, `ReconciliationItem`.
- Consumes existing models: `Guardian`, `Student`, `FeeAssignment`, `Transaction`, `Receipt`, `ChequeRecord`, `WaiverPenalty`.

- [ ] **Step 1: Write schema rule test for model presence**

Create `apps/api/tests/schema-rules.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');

describe('financial schema rules', () => {
  test('contains receipt sequence and ledger models', () => {
    expect(schema).toContain('model ReceiptSequence');
    expect(schema).toContain('model LedgerEntry');
    expect(schema).toContain('@@unique([year])');
  });

  test('contains duplicate prevention constraints', () => {
    expect(schema).toContain('@@unique([studentId, feeStructureId])');
    expect(schema).toContain('@unique @map("idempotency_key")');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- schema-rules.test.js`

Expected: FAIL because new models and unique assignment constraint are missing.

- [ ] **Step 3: Add financial schema models and indexes**

In `apps/api/prisma/schema.prisma`, add to `FeeAssignment`:

```prisma
  @@unique([studentId, feeStructureId])
  @@index([studentId, status])
  @@index([dueDate])
```

Add to `Transaction`:

```prisma
  paymentOrders PaymentOrder[]
  ledgerEntries LedgerEntry[]

  @@index([studentId, status])
  @@index([feeAssignmentId, status])
  @@index([createdAt])
```

Add these models:

```prisma
model ReceiptSequence {
  id        Int      @id @default(autoincrement())
  year      Int      @unique
  nextValue Int      @default(1) @map("next_value")
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamp()

  @@unique([year])
  @@map("receipt_sequences")
}

model LedgerEntry {
  id            Int         @id @default(autoincrement())
  transactionId Int?        @map("transaction_id")
  transaction   Transaction? @relation(fields: [transactionId], references: [id])
  studentId     Int         @map("student_id")
  student       Student     @relation(fields: [studentId], references: [id], onDelete: Cascade)
  type          String      @db.VarChar(30)
  direction     String      @db.VarChar(10)
  amount        Decimal     @db.Decimal(10, 2)
  reference     String?     @db.VarChar(100)
  note          String?     @db.VarChar(255)
  createdById   Int?        @map("created_by_id")
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamp()

  @@index([studentId, createdAt])
  @@index([transactionId])
  @@map("ledger_entries")
}

model PaymentOrder {
  id            Int         @id @default(autoincrement())
  transactionId Int         @map("transaction_id")
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  orderId       String      @unique @map("order_id") @db.VarChar(100)
  provider      String      @default("cashfree") @db.VarChar(40)
  status        String      @default("created") @db.VarChar(30)
  rawResponse   Json?       @map("raw_response")
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamp()
  updatedAt     DateTime    @updatedAt @map("updated_at") @db.Timestamp()

  @@index([status])
  @@map("payment_orders")
}

model ReconciliationBatch {
  id          Int      @id @default(autoincrement())
  uploadedById Int    @map("uploaded_by_id")
  fileName    String? @map("file_name") @db.VarChar(255)
  status      String  @default("processed") @db.VarChar(30)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamp()
  items       ReconciliationItem[]

  @@index([createdAt])
  @@map("reconciliation_batches")
}

model ReconciliationItem {
  id            Int      @id @default(autoincrement())
  batchId       Int      @map("batch_id")
  batch         ReconciliationBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  transactionId Int?     @map("transaction_id")
  amount        Decimal  @db.Decimal(10, 2)
  statementDate DateTime @map("statement_date") @db.Date
  reference     String?  @db.VarChar(100)
  status        String   @default("unmatched") @db.VarChar(30)
  reason        String?  @db.VarChar(255)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamp()

  @@index([transactionId])
  @@index([status])
  @@map("reconciliation_items")
}
```

Add to `Student`:

```prisma
  ledgerEntries    LedgerEntry[]
```

- [ ] **Step 4: Update seed for sequence row**

In `apps/api/prisma/seed.js`, after active academic year creation, add:

```javascript
await prisma.receiptSequence.upsert({
  where: { year: new Date().getFullYear() },
  update: {},
  create: { year: new Date().getFullYear(), nextValue: 1 }
});
```

- [ ] **Step 5: Generate Prisma client and run tests**

Run: `pnpm --filter smart-school-api db:generate`

Expected: Prisma client generated successfully.

Run: `pnpm --filter smart-school-api test -- schema-rules.test.js`

Expected: PASS.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/seed.js apps/api/tests/schema-rules.test.js
git commit -m "feat: add financial consistency schema"
```

---

### Task 4: Atomic Receipts And Ledger Services

**Files:**
- Create: `apps/api/src/domain/payments/receiptService.js`
- Create: `apps/api/src/domain/payments/ledgerService.js`
- Modify: `apps/api/src/utils/receipts.js`
- Test: `apps/api/tests/receipt-sequence.test.js`

**Interfaces:**
- Produces: `allocateReceiptNumber({ tx, year }): Promise<string>`
- Produces: `createReceiptForTransaction({ tx, transaction, student, guardian, feeStructure }): Promise<{ receiptNumber: string, receipt: object }>`
- Produces: `createLedgerEntry({ tx, transactionId, studentId, type, direction, amount, reference, note, createdById }): Promise<object>`
- Consumes: Prisma transaction client from `$transaction`.

- [ ] **Step 1: Write failing receipt allocation tests**

Create `apps/api/tests/receipt-sequence.test.js`:

```javascript
describe('receipt number formatting', () => {
  test('formats year and sequence', () => {
    const { formatReceiptNumber } = require('../src/domain/payments/receiptService');
    expect(formatReceiptNumber(2026, 1)).toBe('REC-2026-0001');
    expect(formatReceiptNumber(2026, 42)).toBe('REC-2026-0042');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- receipt-sequence.test.js`

Expected: FAIL with `Cannot find module '../src/domain/payments/receiptService'`.

- [ ] **Step 3: Create receipt service**

Create `apps/api/src/domain/payments/receiptService.js`:

```javascript
const { generateReceiptBase64 } = require('../../utils/receipts');

const formatReceiptNumber = (year, sequence) => `REC-${year}-${String(sequence).padStart(4, '0')}`;

const allocateReceiptNumber = async ({ tx, year = new Date().getFullYear() }) => {
  const sequence = await tx.receiptSequence.upsert({
    where: { year },
    update: { nextValue: { increment: 1 } },
    create: { year, nextValue: 2 }
  });
  return formatReceiptNumber(year, sequence.nextValue - 1);
};

const createReceiptForTransaction = async ({ tx, transaction, student, guardian, feeStructure }) => {
  const receiptNumber = await allocateReceiptNumber({ tx });
  const updatedTransaction = await tx.transaction.update({
    where: { id: transaction.id },
    data: { receiptNumber }
  });
  const receiptBase64 = await generateReceiptBase64(updatedTransaction, student, guardian, feeStructure);
  const receipt = await tx.receipt.create({
    data: {
      transactionId: transaction.id,
      receiptNumber,
      fileUrl: receiptBase64
    }
  });
  return { receiptNumber, receipt, transaction: updatedTransaction };
};

module.exports = {
  formatReceiptNumber,
  allocateReceiptNumber,
  createReceiptForTransaction
};
```

- [ ] **Step 4: Create ledger service**

Create `apps/api/src/domain/payments/ledgerService.js`:

```javascript
const prisma = require('../../config/db');

const createLedgerEntry = async ({
  tx = prisma,
  transactionId = null,
  studentId,
  type,
  direction,
  amount,
  reference = null,
  note = null,
  createdById = null
}) => {
  if (!studentId || !type || !direction || amount === undefined) {
    throw Object.assign(new Error('studentId, type, direction and amount are required for ledger entry'), { statusCode: 400 });
  }
  if (!['debit', 'credit'].includes(direction)) {
    throw Object.assign(new Error('Ledger direction must be debit or credit'), { statusCode: 400 });
  }
  return tx.ledgerEntry.create({
    data: {
      transactionId,
      studentId,
      type,
      direction,
      amount: Number(amount),
      reference,
      note,
      createdById
    }
  });
};

module.exports = {
  createLedgerEntry
};
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter smart-school-api test -- receipt-sequence.test.js`

Expected: PASS.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain/payments/receiptService.js apps/api/src/domain/payments/ledgerService.js apps/api/tests/receipt-sequence.test.js
git commit -m "feat: add atomic receipt and ledger services"
```

---

### Task 5: Payment State Service For Cash, UPI, And Cheque

**Files:**
- Create: `apps/api/src/domain/payments/paymentService.js`
- Modify: `apps/api/src/controllers/payments.js`
- Modify: `apps/api/src/controllers/cheques.js`
- Test: `apps/api/tests/payment-service.test.js`

**Interfaces:**
- Produces: `collectCash({ feeAssignmentId, amount, idempotencyKey, actorId, actorRole, deposited }): Promise<object>`
- Produces: `collectCheque({ feeAssignmentId, amount, chequeNo, bank, idempotencyKey, actorId, actorRole }): Promise<object>`
- Produces: `markUpiSuccess({ orderId, gatewayTxnId, actorId }): Promise<object>`
- Produces: `clearCheque({ chequeRecordId, actorId, actorRole }): Promise<object>`
- Produces: `bounceCheque({ chequeRecordId, reason, actorId, actorRole }): Promise<object>`
- Consumes: `createReceiptForTransaction` and `createLedgerEntry` from Task 4.

- [ ] **Step 1: Write failing pure helper tests**

Create `apps/api/tests/payment-service.test.js`:

```javascript
describe('payment state guards', () => {
  test('prevents payment on paid assignment', () => {
    const { assertAssignmentPayable } = require('../src/domain/payments/paymentService');
    expect(() => assertAssignmentPayable({ status: 'paid' })).toThrow('Fee component is already paid');
  });

  test('allows pending and overdue assignments', () => {
    const { assertAssignmentPayable } = require('../src/domain/payments/paymentService');
    expect(() => assertAssignmentPayable({ status: 'pending' })).not.toThrow();
    expect(() => assertAssignmentPayable({ status: 'overdue' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- payment-service.test.js`

Expected: FAIL with `Cannot find module '../src/domain/payments/paymentService'`.

- [ ] **Step 3: Create payment service**

Create `apps/api/src/domain/payments/paymentService.js` with this initial structure:

```javascript
const prisma = require('../../config/db');
const { createReceiptForTransaction } = require('./receiptService');
const { createLedgerEntry } = require('./ledgerService');

const assertAssignmentPayable = (assignment) => {
  if (!assignment) throw Object.assign(new Error('Fee assignment not found'), { statusCode: 404 });
  if (assignment.status === 'paid') throw Object.assign(new Error('Fee component is already paid'), { statusCode: 400 });
  if (!['pending', 'overdue'].includes(assignment.status)) {
    throw Object.assign(new Error(`Fee assignment cannot be paid from status ${assignment.status}`), { statusCode: 400 });
  }
};

const loadAssignment = (tx, feeAssignmentId) => tx.feeAssignment.findUnique({
  where: { id: Number(feeAssignmentId) },
  include: { student: { include: { guardian: true } }, feeStructure: true }
});

const collectCash = async ({ feeAssignmentId, amount, idempotencyKey, actorId, actorRole, deposited = false }) => {
  const existing = await prisma.transaction.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const assignment = await loadAssignment(tx, feeAssignmentId);
    assertAssignmentPayable(assignment);
    const paymentAmount = Number(amount || assignment.feeStructure.amount);
    const transaction = await tx.transaction.create({
      data: {
        studentId: assignment.studentId,
        feeAssignmentId: assignment.id,
        amount: paymentAmount,
        method: 'CASH',
        status: 'success',
        depositedAt: deposited ? new Date() : null,
        idempotencyKey
      }
    });
    const receiptResult = await createReceiptForTransaction({
      tx,
      transaction,
      student: assignment.student,
      guardian: assignment.student.guardian,
      feeStructure: assignment.feeStructure
    });
    await tx.feeAssignment.update({ where: { id: assignment.id }, data: { status: 'paid' } });
    await createLedgerEntry({
      tx,
      transactionId: transaction.id,
      studentId: assignment.studentId,
      type: 'payment',
      direction: 'credit',
      amount: paymentAmount,
      reference: receiptResult.receiptNumber,
      note: 'Cash collection',
      createdById: actorId
    });
    await tx.auditLog.create({
      data: {
        actorId,
        actorRole,
        action: 'collect_cash',
        entity: 'transaction',
        entityId: transaction.id,
        before: null,
        after: { transactionId: transaction.id, receiptNumber: receiptResult.receiptNumber, amount: paymentAmount }
      }
    });
    return { ...receiptResult.transaction, receiptNumber: receiptResult.receiptNumber };
  });
};

const collectCheque = async ({ feeAssignmentId, amount, chequeNo, bank, idempotencyKey, actorId, actorRole }) => {
  if (!chequeNo || !bank) throw Object.assign(new Error('chequeNo and bank are required for cheque payments'), { statusCode: 400 });
  const existing = await prisma.transaction.findUnique({ where: { idempotencyKey }, include: { chequeRecords: true } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const assignment = await loadAssignment(tx, feeAssignmentId);
    assertAssignmentPayable(assignment);
    const paymentAmount = Number(amount || assignment.feeStructure.amount);
    const transaction = await tx.transaction.create({
      data: {
        studentId: assignment.studentId,
        feeAssignmentId: assignment.id,
        amount: paymentAmount,
        method: 'CHEQUE',
        status: 'pending',
        idempotencyKey
      }
    });
    const cheque = await tx.chequeRecord.create({
      data: { transactionId: transaction.id, chequeNo, bank, depositStatus: 'deposit_pending' }
    });
    await tx.auditLog.create({
      data: {
        actorId,
        actorRole,
        action: 'collect_cheque',
        entity: 'transaction',
        entityId: transaction.id,
        before: null,
        after: { transactionId: transaction.id, chequeRecordId: cheque.id, amount: paymentAmount }
      }
    });
    return { ...transaction, chequeRecords: [cheque] };
  });
};

module.exports = {
  assertAssignmentPayable,
  collectCash,
  collectCheque
};
```

- [ ] **Step 4: Replace cash and cheque collection controller paths**

In `apps/api/src/controllers/payments.js`, import:

```javascript
const { collectCash, collectCheque } = require('../domain/payments/paymentService');
```

Replace `collectManual` internals after request validation with:

```javascript
const idempotencyKey = req.body.idempotencyKey || `MAN_${feeAssignmentId}_${method}_${Date.now()}`;
const transaction = method === 'CASH'
  ? await collectCash({ feeAssignmentId, amount: req.body.amount, idempotencyKey, actorId: req.user.id, actorRole: req.user.role, deposited })
  : await collectCheque({ feeAssignmentId, amount: req.body.amount, chequeNo, bank, idempotencyKey, actorId: req.user.id, actorRole: req.user.role });

return res.status(201).json({ success: true, message: `${method} payment logged successfully`, transaction });
```

Replace `collectOffline` internals after idempotency and method validation with:

```javascript
const transaction = method === 'CASH'
  ? await collectCash({ feeAssignmentId: fee_assignment_id, amount, idempotencyKey: idempotency_key, actorId, actorRole: req.user.role, deposited: false })
  : await collectCheque({ feeAssignmentId: fee_assignment_id, amount, chequeNo: cheque_no, bank, idempotencyKey: idempotency_key, actorId, actorRole: req.user.role });
return res.status(201).json(transaction);
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter smart-school-api test -- payment-service.test.js`

Expected: PASS.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain/payments/paymentService.js apps/api/src/controllers/payments.js apps/api/tests/payment-service.test.js
git commit -m "feat: centralize cash and cheque payment state"
```

---

### Task 6: UPI Webhook Integrity And Production Mock Removal

**Files:**
- Modify: `apps/api/src/domain/payments/paymentService.js`
- Modify: `apps/api/src/controllers/payments.js`
- Modify: `apps/api/src/config/cashfree.js`
- Test: `apps/api/tests/upi-webhook.test.js`

**Interfaces:**
- Produces: `markUpiSuccess({ orderId, gatewayTxnId, actorId }): Promise<object>`
- Produces: `markUpiFailed({ orderId, reason }): Promise<object>`
- Consumes: `createReceiptForTransaction`, `createLedgerEntry`, `requireConfig()`.

- [ ] **Step 1: Write failing pure production guard test**

Create `apps/api/tests/upi-webhook.test.js`:

```javascript
describe('upi mock guard', () => {
  test('production does not allow mock verify promotion', () => {
    const { canAutoPromoteMockPayment } = require('../src/controllers/payments');
    expect(canAutoPromoteMockPayment('production')).toBe(false);
    expect(canAutoPromoteMockPayment('development')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- upi-webhook.test.js`

Expected: FAIL because `canAutoPromoteMockPayment` is not exported.

- [ ] **Step 3: Add UPI state service functions**

Append to `apps/api/src/domain/payments/paymentService.js`:

```javascript
const markUpiSuccess = async ({ orderId, gatewayTxnId, actorId = null }) => {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findFirst({
      where: { gatewayRef: orderId },
      include: { student: { include: { guardian: true } }, feeAssignment: { include: { feeStructure: true } } }
    });
    if (!transaction) throw Object.assign(new Error('Transaction reference not found'), { statusCode: 404 });
    if (transaction.status === 'success') return transaction;

    const updated = await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'success', gatewayRef: orderId }
    });
    const receiptResult = await createReceiptForTransaction({
      tx,
      transaction: updated,
      student: transaction.student,
      guardian: transaction.student.guardian,
      feeStructure: transaction.feeAssignment.feeStructure
    });
    await tx.feeAssignment.update({ where: { id: transaction.feeAssignmentId }, data: { status: 'paid' } });
    await createLedgerEntry({
      tx,
      transactionId: transaction.id,
      studentId: transaction.studentId,
      type: 'payment',
      direction: 'credit',
      amount: transaction.amount,
      reference: gatewayTxnId || orderId,
      note: 'UPI payment success',
      createdById: actorId
    });
    await tx.auditLog.create({
      data: {
        actorId: transaction.student.guardianId,
        actorRole: 'guardian',
        action: 'payment_success',
        entity: 'transaction',
        entityId: transaction.id,
        before: { id: transaction.id, status: transaction.status },
        after: { id: transaction.id, status: 'success', receiptNumber: receiptResult.receiptNumber }
      }
    });
    return { ...receiptResult.transaction, receiptNumber: receiptResult.receiptNumber };
  });
};

const markUpiFailed = async ({ orderId, reason = 'Gateway marked payment failed' }) => {
  return prisma.transaction.updateMany({
    where: { gatewayRef: orderId, status: 'pending' },
    data: { status: 'failed' }
  });
};

module.exports.markUpiSuccess = markUpiSuccess;
module.exports.markUpiFailed = markUpiFailed;
```

- [ ] **Step 4: Remove production mock promotion**

In `apps/api/src/controllers/payments.js`, add:

```javascript
const { requireConfig } = require('../config/env');
const canAutoPromoteMockPayment = (nodeEnv) => nodeEnv !== 'production';
```

In `verifyPayment`, wrap auto-promotion logic with:

```javascript
if (tx.status === 'pending' && canAutoPromoteMockPayment(requireConfig().nodeEnv)) {
  tx = await markUpiSuccess({ orderId: order_id, gatewayTxnId: `MOCK_${Date.now()}`, actorId: tx.student.guardianId });
}
```

In `handleWebhook`, replace duplicated success transaction code with:

```javascript
if (orderStatus === 'PAID' || orderStatus === 'SUCCESS' || orderStatus === 'SUCCESSFUL') {
  await markUpiSuccess({ orderId, gatewayTxnId });
  return res.status(200).json({ status: 'success' });
}
await markUpiFailed({ orderId, reason: orderStatus });
return res.status(200).json({ status: 'failed' });
```

Add `canAutoPromoteMockPayment` to the existing export object at the bottom of `apps/api/src/controllers/payments.js`:

```javascript
module.exports = {
  initiatePayment,
  handleWebhook,
  verifyPayment,
  getReceipt,
  getTransactions,
  collectManual,
  collectOffline,
  syncOffline,
  depositCash,
  canAutoPromoteMockPayment
};
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter smart-school-api test -- upi-webhook.test.js`

Expected: PASS.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain/payments/paymentService.js apps/api/src/controllers/payments.js apps/api/src/config/cashfree.js apps/api/tests/upi-webhook.test.js
git commit -m "feat: enforce upi webhook as production source of truth"
```

---

### Task 7: Request Validation And Role-Safe API Access

**Files:**
- Create: `apps/api/src/middlewares/validate.js`
- Create: `apps/api/src/schemas/paymentSchemas.js`
- Create: `apps/api/src/schemas/feeSchemas.js`
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/controllers/fee.js`
- Modify: `apps/api/src/controllers/payments.js`
- Modify: `apps/api/src/controllers/kyc.js`
- Test: `apps/api/tests/validation.test.js`

**Interfaces:**
- Produces: `validateBody(schema)(req, res, next): void`
- Produces: `validateQuery(schema)(req, res, next): void`
- Produces: `numberField(name, options): function`
- Produces: `stringField(name, options): function`
- Consumes: existing Express route definitions.

- [ ] **Step 1: Write failing validation helper tests**

Create `apps/api/tests/validation.test.js`:

```javascript
describe('validation helpers', () => {
  test('numberField accepts positive integers', () => {
    const { numberField } = require('../src/middlewares/validate');
    expect(numberField('feeAssignmentId', { integer: true, min: 1 })({ feeAssignmentId: 10 })).toBeNull();
  });

  test('numberField rejects non-numeric values', () => {
    const { numberField } = require('../src/middlewares/validate');
    expect(numberField('feeAssignmentId', { integer: true, min: 1 })({ feeAssignmentId: 'abc' })).toBe('feeAssignmentId must be a number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- validation.test.js`

Expected: FAIL with `Cannot find module '../src/middlewares/validate'`.

- [ ] **Step 3: Create no-dependency validation middleware**

Create `apps/api/src/middlewares/validate.js`:

```javascript
const numberField = (name, options = {}) => (source) => {
  const value = source[name];
  if (value === undefined || value === null || value === '') {
    return options.required === false ? null : `${name} is required`;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${name} must be a number`;
  if (options.integer && !Number.isInteger(numeric)) return `${name} must be an integer`;
  if (options.min !== undefined && numeric < options.min) return `${name} must be at least ${options.min}`;
  return null;
};

const stringField = (name, options = {}) => (source) => {
  const value = source[name];
  if (value === undefined || value === null || value === '') {
    return options.required === false ? null : `${name} is required`;
  }
  if (typeof value !== 'string') return `${name} must be a string`;
  if (options.oneOf && !options.oneOf.includes(value)) return `${name} must be one of: ${options.oneOf.join(', ')}`;
  if (options.max && value.length > options.max) return `${name} must be at most ${options.max} characters`;
  return null;
};

const runValidation = (schema, source) => {
  for (const rule of schema) {
    const error = rule(source);
    if (error) return error;
  }
  return null;
};

const validateBody = (schema) => (req, res, next) => {
  const error = runValidation(schema, req.body || {});
  if (error) return res.status(400).json({ error, requestId: req.requestId });
  next();
};

const validateQuery = (schema) => (req, res, next) => {
  const error = runValidation(schema, req.query || {});
  if (error) return res.status(400).json({ error, requestId: req.requestId });
  next();
};

module.exports = {
  numberField,
  stringField,
  validateBody,
  validateQuery
};
```

- [ ] **Step 4: Create payment and fee schemas**

Create `apps/api/src/schemas/paymentSchemas.js`:

```javascript
const { numberField, stringField } = require('../middlewares/validate');

const initiatePaymentSchema = [
  numberField('feeAssignmentId', { integer: true, min: 1 }),
  stringField('method', { oneOf: ['UPI'] }),
  stringField('idempotencyKey', { max: 100 })
];

const collectManualSchema = [
  numberField('feeAssignmentId', { integer: true, min: 1 }),
  stringField('method', { oneOf: ['CASH', 'CHEQUE'] })
];

const collectOfflineSchema = [
  numberField('fee_assignment_id', { integer: true, min: 1 }),
  stringField('method', { oneOf: ['CASH', 'CHEQUE'] }),
  stringField('idempotency_key', { max: 100 })
];

module.exports = {
  initiatePaymentSchema,
  collectManualSchema,
  collectOfflineSchema
};
```

Create `apps/api/src/schemas/feeSchemas.js`:

```javascript
const { numberField, stringField } = require('../middlewares/validate');

const createFeeStructureSchema = [
  stringField('name', { max: 100 }),
  numberField('amount', { min: 0 }),
  stringField('type', { oneOf: ['tuition', 'transport', 'late_fee', 'other'] }),
  stringField('appliesTo', { max: 50 }),
  numberField('academicYearId', { integer: true, min: 1 })
];

const assignFeeSchema = [
  numberField('studentId', { integer: true, min: 1 }),
  numberField('feeStructureId', { integer: true, min: 1 }),
  stringField('dueDate', { max: 30 })
];

module.exports = {
  createFeeStructureSchema,
  assignFeeSchema
};
```

- [ ] **Step 5: Wire validators to routes**

In `apps/api/src/index.js`, import validators:

```javascript
const { validateBody } = require('./middlewares/validate');
const paymentSchemas = require('./schemas/paymentSchemas');
const feeSchemas = require('./schemas/feeSchemas');
```

Update routes:

```javascript
app.post('/api/payments/initiate', authenticate, checkRole(['guardian']), validateBody(paymentSchemas.initiatePaymentSchema), paymentsController.initiatePayment);
app.post('/api/payments/collect-manual', authenticate, checkRole(['admin', 'cashier']), validateBody(paymentSchemas.collectManualSchema), paymentsController.collectManual);
app.post('/api/payments/offline', authenticate, checkRole(['admin', 'cashier']), validateBody(paymentSchemas.collectOfflineSchema), paymentsController.collectOffline);
app.post('/api/fees/structures', authenticate, checkRole(['admin']), validateBody(feeSchemas.createFeeStructureSchema), auditLogger('fee_structure', 'create_fee_structure'), feeController.createFeeStructure);
app.post('/api/fees/assignments', authenticate, checkRole(['admin', 'cashier']), validateBody(feeSchemas.assignFeeSchema), auditLogger('fee_assignment', 'assign_fee'), feeController.assignFee);
```

- [ ] **Step 6: Tighten guardian ownership**

In `apps/api/src/controllers/payments.js`, in `getReceipt`, fetch receipt with transaction ownership:

```javascript
const receipt = await prisma.receipt.findUnique({
  where: { transactionId: Number(transaction_id) },
  include: { transaction: { include: { student: true } } }
});
if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
if (req.user.role === 'guardian' && receipt.transaction.student.guardianId !== req.user.id) {
  return res.status(403).json({ error: 'Forbidden: Access denied' });
}
```

In `apps/api/src/controllers/kyc.js`, after loading student in `submitKYC`, add:

```javascript
if (req.user.role === 'guardian' && student.guardianId !== req.user.id) {
  return res.status(403).json({ error: 'Forbidden: Access denied' });
}
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter smart-school-api test -- validation.test.js`

Expected: PASS.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/middlewares/validate.js apps/api/src/schemas/paymentSchemas.js apps/api/src/schemas/feeSchemas.js apps/api/src/index.js apps/api/src/controllers/fee.js apps/api/src/controllers/payments.js apps/api/src/controllers/kyc.js apps/api/tests/validation.test.js
git commit -m "feat: add request validation and ownership checks"
```

---

### Task 8: Offline Sync With Per-Item Results

**Files:**
- Create: `apps/api/src/domain/payments/offlineSyncService.js`
- Modify: `apps/api/src/controllers/payments.js`
- Modify: `apps/web/src/utils/idb.js`
- Modify: `apps/web/src/pages/cashier/OfflineQueue.jsx`
- Modify: `apps/web/src/pages/cashier/Collections.jsx`
- Test: `apps/api/tests/offline-sync.test.js`

**Interfaces:**
- Produces: `syncOfflinePayments({ payments, actorId, actorRole }): Promise<{ results: Array<{ idempotency_key: string, status: string, transactionId?: number, error?: string }> }>`
- Produces web helpers: `updatePaymentInQueue(idempotencyKey, patch)`, `clearSyncedPayments()`.
- Consumes: `collectCash`, `collectCheque` from Task 5.

- [ ] **Step 1: Write failing sync result test**

Create `apps/api/tests/offline-sync.test.js`:

```javascript
describe('offline sync result shape', () => {
  test('normalizes empty batch', async () => {
    const { syncOfflinePayments } = require('../src/domain/payments/offlineSyncService');
    const result = await syncOfflinePayments({ payments: [], actorId: 1, actorRole: 'cashier' });
    expect(result).toEqual({ results: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- offline-sync.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Create offline sync service**

Create `apps/api/src/domain/payments/offlineSyncService.js`:

```javascript
const { collectCash, collectCheque } = require('./paymentService');

const syncOfflinePayments = async ({ payments, actorId, actorRole }) => {
  if (!Array.isArray(payments) || payments.length === 0) return { results: [] };
  const results = [];

  for (const payment of payments) {
    try {
      const transaction = payment.method === 'CASH'
        ? await collectCash({
            feeAssignmentId: payment.fee_assignment_id,
            amount: payment.amount,
            idempotencyKey: payment.idempotency_key,
            actorId,
            actorRole,
            deposited: false
          })
        : await collectCheque({
            feeAssignmentId: payment.fee_assignment_id,
            amount: payment.amount,
            chequeNo: payment.cheque_no,
            bank: payment.bank,
            idempotencyKey: payment.idempotency_key,
            actorId,
            actorRole
          });

      results.push({
        idempotency_key: payment.idempotency_key,
        status: 'synced',
        transactionId: transaction.id,
        receiptNumber: transaction.receiptNumber || null
      });
    } catch (err) {
      results.push({
        idempotency_key: payment.idempotency_key,
        status: err.statusCode === 409 ? 'conflict' : 'failed',
        error: err.message
      });
    }
  }

  return { results };
};

module.exports = {
  syncOfflinePayments
};
```

- [ ] **Step 4: Replace controller sync loop**

In `apps/api/src/controllers/payments.js`, import:

```javascript
const { syncOfflinePayments } = require('../domain/payments/offlineSyncService');
```

Replace `syncOffline` body with:

```javascript
const { payments } = req.body;
const result = await syncOfflinePayments({
  payments,
  actorId: req.user.id,
  actorRole: req.user.role
});
return res.status(200).json(result);
```

- [ ] **Step 5: Improve IndexedDB queue metadata**

In `apps/web/src/utils/idb.js`, add:

```javascript
export const updatePaymentInQueue = async (idempotencyKey, patch) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(idempotencyKey);
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) return resolve(false);
      const putRequest = store.put({ ...existing, ...patch, updated_at: new Date().toISOString() });
      putRequest.onsuccess = () => resolve(true);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const clearSyncedPayments = async () => {
  const payments = await getQueuedPayments();
  await Promise.all(payments.filter(p => p.local_status === 'synced').map(p => deletePaymentFromQueue(p.idempotency_key)));
};
```

In `apps/web/src/pages/cashier/Collections.jsx`, when building `paymentPayload`, replace `token: token` with:

```javascript
local_status: 'queued',
attempts: 0,
last_error: null
```

- [ ] **Step 6: Run tests and web build**

Run: `pnpm --filter smart-school-api test -- offline-sync.test.js`

Expected: PASS.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing tests.

Run: `pnpm --filter web build`

Expected: Vite build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/domain/payments/offlineSyncService.js apps/api/src/controllers/payments.js apps/api/tests/offline-sync.test.js apps/web/src/utils/idb.js apps/web/src/pages/cashier/OfflineQueue.jsx apps/web/src/pages/cashier/Collections.jsx
git commit -m "feat: make offline payment sync replay safe"
```

---

### Task 9: Persistent Reconciliation

**Files:**
- Create: `apps/api/src/domain/reconciliation/matcher.js`
- Modify: `apps/api/src/controllers/reconciliation.js`
- Modify: `apps/api/src/controllers/dashboard.js`
- Modify: `apps/web/src/pages/admin/Reconciliation.jsx`
- Test: `apps/api/tests/reconciliation.test.js`

**Interfaces:**
- Produces: `parseStatementCsv(csvText): Array<{ statementDate: Date, amount: number, reference: string | null }>`
- Produces: `matchStatementRows({ rows, transactions }): { matched: Array<object>, unmatched: Array<object> }`
- Consumes: `ReconciliationBatch`, `ReconciliationItem` models from Task 3.

- [ ] **Step 1: Write failing matcher tests**

Create `apps/api/tests/reconciliation.test.js`:

```javascript
describe('reconciliation matcher', () => {
  test('parses date amount reference csv', () => {
    const { parseStatementCsv } = require('../src/domain/reconciliation/matcher');
    const rows = parseStatementCsv('date,amount,reference\n2026-07-27,5000,REC-2026-0001');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].reference).toBe('REC-2026-0001');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- reconciliation.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Create reconciliation matcher**

Create `apps/api/src/domain/reconciliation/matcher.js`:

```javascript
const parseStatementCsv = (csvText) => {
  return String(csvText || '')
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [dateRaw, amountRaw, referenceRaw] = line.split(',').map(part => String(part || '').trim());
      const statementDate = new Date(dateRaw);
      const amount = Number(amountRaw);
      if (Number.isNaN(statementDate.getTime()) || Number.isNaN(amount)) {
        throw Object.assign(new Error(`Invalid statement row: ${line}`), { statusCode: 400 });
      }
      return { statementDate, amount, reference: referenceRaw || null };
    });
};

const sameUtcDay = (a, b) => {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return d1.getUTCFullYear() === d2.getUTCFullYear()
    && d1.getUTCMonth() === d2.getUTCMonth()
    && d1.getUTCDate() === d2.getUTCDate();
};

const matchStatementRows = ({ rows, transactions }) => {
  const used = new Set();
  const matched = [];
  const unmatched = [];

  for (const row of rows) {
    const tx = transactions.find(candidate => {
      if (used.has(candidate.id)) return false;
      const amountMatches = Math.abs(Number(candidate.amount) - row.amount) < 0.01;
      const dateMatches = candidate.depositedAt && sameUtcDay(candidate.depositedAt, row.statementDate);
      const referenceMatches = row.reference && candidate.receiptNumber === row.reference;
      return amountMatches && (referenceMatches || dateMatches);
    });

    if (tx) {
      used.add(tx.id);
      matched.push({ row, transaction: tx });
    } else {
      unmatched.push({ row, reason: 'No deposited transaction matched by amount and date/reference' });
    }
  }

  return { matched, unmatched };
};

module.exports = {
  parseStatementCsv,
  matchStatementRows
};
```

- [ ] **Step 4: Persist reconciliation batches**

In `apps/api/src/controllers/reconciliation.js`, replace line splitting logic with:

```javascript
const { parseStatementCsv, matchStatementRows } = require('../domain/reconciliation/matcher');
```

Inside `uploadStatement`:

```javascript
const rows = parseStatementCsv(csvText);
const dbTransactions = await prisma.transaction.findMany({
  where: { status: 'success', method: { in: ['CASH', 'CHEQUE'] }, NOT: { depositedAt: null } },
  include: { student: true, feeAssignment: { include: { feeStructure: true } } }
});
const { matched, unmatched } = matchStatementRows({ rows, transactions: dbTransactions });

const batch = await prisma.$transaction(async (tx) => {
  const createdBatch = await tx.reconciliationBatch.create({
    data: { uploadedById: req.user.id, fileName: req.body.fileName || null, status: 'processed' }
  });
  for (const item of matched) {
    await tx.reconciliationItem.create({
      data: {
        batchId: createdBatch.id,
        transactionId: item.transaction.id,
        amount: item.row.amount,
        statementDate: item.row.statementDate,
        reference: item.row.reference,
        status: 'matched'
      }
    });
  }
  for (const item of unmatched) {
    await tx.reconciliationItem.create({
      data: {
        batchId: createdBatch.id,
        amount: item.row.amount,
        statementDate: item.row.statementDate,
        reference: item.row.reference,
        status: 'unmatched',
        reason: item.reason
      }
    });
  }
  return createdBatch;
});

return res.status(200).json({
  success: true,
  batchId: batch.id,
  matched: matched.map(item => ({ transactionId: item.transaction.id, receiptNumber: item.transaction.receiptNumber, amount: item.row.amount })),
  unmatched: unmatched.map(item => ({ amount: item.row.amount, reference: item.row.reference, reason: item.reason }))
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter smart-school-api test -- reconciliation.test.js`

Expected: PASS.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain/reconciliation/matcher.js apps/api/src/controllers/reconciliation.js apps/api/src/controllers/dashboard.js apps/web/src/pages/admin/Reconciliation.jsx apps/api/tests/reconciliation.test.js
git commit -m "feat: persist reconciliation batches"
```

---

### Task 10: Privacy And KYC Data Minimization

**Files:**
- Create: `apps/api/src/domain/privacy/masking.js`
- Modify: `apps/api/src/utils/crypto.js`
- Modify: `apps/api/src/controllers/kyc.js`
- Modify: `apps/api/src/controllers/auth.js`
- Modify: `apps/web/src/pages/guardian/Stage2KYC.jsx`
- Test: `apps/api/tests/privacy.test.js`

**Interfaces:**
- Produces: `maskDocumentRef(value): string | null`
- Produces: `maskMobile(value): string | null`
- Produces: `minimizeOcrData(ocrData): { name?: string, dob?: string, confidence?: number }`
- Updates: `encrypt(text)` to use authenticated AES-256-GCM.

- [ ] **Step 1: Write failing privacy tests**

Create `apps/api/tests/privacy.test.js`:

```javascript
describe('privacy masking', () => {
  test('masks document ref to last four characters', () => {
    const { maskDocumentRef } = require('../src/domain/privacy/masking');
    expect(maskDocumentRef('1234 5678 9012')).toBe('**** **** 9012');
  });

  test('minimizes OCR payload', () => {
    const { minimizeOcrData } = require('../src/domain/privacy/masking');
    expect(minimizeOcrData({ name: 'Asha', dob: '2015-01-01', rawText: 'secret' })).toEqual({ name: 'Asha', dob: '2015-01-01' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter smart-school-api test -- privacy.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Create privacy helpers**

Create `apps/api/src/domain/privacy/masking.js`:

```javascript
const maskDocumentRef = (value) => {
  if (!value) return null;
  const clean = String(value).replace(/\s/g, '');
  return clean.length >= 4 ? `**** **** ${clean.slice(-4)}` : '****';
};

const maskMobile = (value) => {
  if (!value) return null;
  const clean = String(value).replace(/\D/g, '');
  return clean.length >= 4 ? `******${clean.slice(-4)}` : '****';
};

const minimizeOcrData = (ocrData) => {
  if (!ocrData || typeof ocrData !== 'object') return {};
  const result = {};
  if (ocrData.name) result.name = String(ocrData.name);
  if (ocrData.dob) result.dob = String(ocrData.dob);
  if (ocrData.confidence !== undefined) result.confidence = Number(ocrData.confidence);
  return result;
};

module.exports = {
  maskDocumentRef,
  maskMobile,
  minimizeOcrData
};
```

- [ ] **Step 4: Use masking in KYC controller**

In `apps/api/src/controllers/kyc.js`, import:

```javascript
const { maskDocumentRef, minimizeOcrData } = require('../domain/privacy/masking');
```

Replace manual doc masking with:

```javascript
const maskedDocRef = maskDocumentRef(docRef);
const safeOcrData = minimizeOcrData(ocrData);
const ocrName = safeOcrData.name;
const ocrDob = safeOcrData.dob;
```

Use `safeOcrData` in `studentKYC.upsert`:

```javascript
ocrData: safeOcrData,
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter smart-school-api test -- privacy.test.js`

Expected: PASS.

Run: `pnpm --filter smart-school-api test`

Expected: PASS existing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain/privacy/masking.js apps/api/src/utils/crypto.js apps/api/src/controllers/kyc.js apps/api/src/controllers/auth.js apps/web/src/pages/guardian/Stage2KYC.jsx apps/api/tests/privacy.test.js
git commit -m "feat: minimize sensitive kyc data"
```

---

### Task 11: Frontend API Client And Role Shell

**Files:**
- Create: `apps/web/src/api/client.js`
- Create: `apps/web/src/components/layout/AppShell.jsx`
- Create: `apps/web/src/components/layout/RoleNav.jsx`
- Create: `apps/web/src/components/common/StatusBadge.jsx`
- Create: `apps/web/src/components/common/EmptyState.jsx`
- Create: `apps/web/src/components/common/ErrorState.jsx`
- Modify: `apps/web/src/stores/authStore.js`
- Modify: `apps/web/src/App.jsx`

**Interfaces:**
- Produces: `api.get/post/put/delete` axios instance.
- Produces: `setAuthToken(token: string | null): void`
- Produces: `normalizeApiError(error): string`
- Produces: `<AppShell user onLogout children />`
- Produces: `<RoleNav role activeTab onChange />`

- [ ] **Step 1: Create API client**

Create `apps/web/src/api/client.js`:

```javascript
import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000
});

export const setAuthToken = (token) => {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
};

export const normalizeApiError = (error) => {
  return error.response?.data?.error || error.message || 'Request failed';
};
```

- [ ] **Step 2: Update auth store to use API client**

In `apps/web/src/stores/authStore.js`, replace `import axios from 'axios';` with:

```javascript
import { api, setAuthToken, normalizeApiError } from '../api/client';
```

Replace `axios.post('/api/auth/login'` with `api.post('/auth/login'`, and apply the same `/api` removal for all auth store calls.

Replace manual auth header mutation with:

```javascript
setAuthToken(token);
```

Replace error extraction with:

```javascript
const errorMsg = normalizeApiError(err);
```

- [ ] **Step 3: Create shared UI components**

Create `apps/web/src/components/common/StatusBadge.jsx`:

```jsx
export default function StatusBadge({ status }) {
  const normalized = String(status || 'unknown').toLowerCase();
  const className = normalized === 'active' || normalized === 'paid' || normalized === 'success'
    ? 'badge badge-active'
    : 'badge badge-pending';
  return <span className={className} style={{ textTransform: 'capitalize' }}>{normalized}</span>;
}
```

Create `apps/web/src/components/common/EmptyState.jsx`:

```jsx
export default function EmptyState({ title, message }) {
  return (
    <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <h3 style={{ color: 'white', marginBottom: '8px' }}>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
```

Create `apps/web/src/components/common/ErrorState.jsx`:

```jsx
export default function ErrorState({ message }) {
  if (!message) return null;
  return <div className="alert alert-error">{message}</div>;
}
```

- [ ] **Step 4: Create role shell components**

Create `apps/web/src/components/layout/RoleNav.jsx`:

```jsx
const tabsByRole = {
  admin: [
    ['dashboard', 'Dashboard'],
    ['fees', 'Fees'],
    ['approvals', 'Approvals'],
    ['reports', 'Reports'],
    ['reconciliation', 'Reconciliation'],
    ['expenses', 'Expenses']
  ],
  cashier: [
    ['collect', 'Collect'],
    ['offline', 'Offline Queue'],
    ['deposits', 'Deposits']
  ],
  guardian: [
    ['wards', 'My Wards'],
    ['payment', 'Pay Fees'],
    ['receipts', 'Receipts']
  ]
};

export default function RoleNav({ role, activeTab, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px' }}>
      {(tabsByRole[role] || []).map(([key, label]) => (
        <button key={key} type="button" className={`btn ${activeTab === key ? '' : 'btn-secondary'}`} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
```

Create `apps/web/src/components/layout/AppShell.jsx`:

```jsx
export default function AppShell({ user, onLogout, children }) {
  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '40px' }}>
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', marginBottom: '30px', gap: '20px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Smart School Fee Platform</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Logged in as <strong style={{ color: 'white' }}>{user.name}</strong> ({user.role})
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={onLogout}>Log Out</button>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Run web verification**

Run: `pnpm --filter web lint`

Expected: oxlint exits successfully.

Run: `pnpm --filter web build`

Expected: Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api/client.js apps/web/src/components/layout/AppShell.jsx apps/web/src/components/layout/RoleNav.jsx apps/web/src/components/common/StatusBadge.jsx apps/web/src/components/common/EmptyState.jsx apps/web/src/components/common/ErrorState.jsx apps/web/src/stores/authStore.js apps/web/src/App.jsx
git commit -m "feat: add production frontend shell and api client"
```

---

### Task 12: Production Dashboard And Cashier UX Cleanup

**Files:**
- Modify: `apps/api/src/controllers/dashboard.js`
- Modify: `apps/web/src/pages/admin/Dashboard.jsx`
- Modify: `apps/web/src/pages/cashier/Collections.jsx`
- Modify: `apps/web/src/pages/cashier/Deposits.jsx`
- Modify: `apps/web/src/pages/guardian/Payment.jsx`
- Modify: `apps/web/src/pages/guardian/Receipts.jsx`

**Interfaces:**
- Produces dashboard response fields: `bank_balance`, `in_hand_cash`, `pending_fees`, `today_collections`, `unreconciled_deposits`, `refunded_total`.
- Consumes frontend `api` client and common components from Task 11.

- [ ] **Step 1: Adjust dashboard metrics for financial clarity**

In `apps/api/src/controllers/dashboard.js`, extend response calculation with:

```javascript
const unreconciledDepositsResult = await prisma.transaction.aggregate({
  where: {
    status: 'success',
    method: { in: ['CASH', 'CHEQUE'] },
    NOT: { depositedAt: null },
    receiptRecord: { isNot: null }
  },
  _sum: { amount: true }
});

const refundedResult = await prisma.transaction.aggregate({
  where: { status: 'reversed' },
  _sum: { amount: true }
});
```

Return:

```javascript
return res.status(200).json({
  bank_balance: bankBalance,
  in_hand_cash: inHandCash,
  pending_fees: pendingFees,
  today_collections: todayCollections,
  unreconciled_deposits: Number(unreconciledDepositsResult._sum.amount || 0),
  refunded_total: Number(refundedResult._sum.amount || 0)
});
```

- [ ] **Step 2: Remove fake notification claims**

In `apps/web/src/pages/admin/Dashboard.jsx`, replace the `Send Reminder` branch:

```javascript
} else if (action === 'Send Reminder') {
  setToastMessage('Reminder dispatch is not configured yet. Export the defaulter list or open WhatsApp links from the defaulter panel.');
  setTimeout(() => setToastMessage(null), 4000);
}
```

- [ ] **Step 3: Show richer cashier result states**

In `apps/web/src/pages/cashier/Collections.jsx`, replace success message after online collection with:

```javascript
const receipt = data.receiptNumber || data.transaction?.receiptNumber;
setSuccess(method === 'CASH'
  ? `Cash payment recorded. Receipt: ${receipt || 'created'}. Cash remains in-hand until deposited.`
  : 'Cheque recorded. Receipt will be generated only after bank clearance.');
```

- [ ] **Step 4: Ensure guardian payment shows adjusted pending amount**

In `apps/web/src/pages/guardian/Payment.jsx`, calculate assignment display amount:

```javascript
const adjustedAmount = (asg) => {
  const base = Number(asg.feeStructure.amount);
  return (asg.waiverPenalties || []).reduce((total, item) => {
    if (item.status !== 'approved') return total;
    return item.type === 'penalty' ? total + Number(item.amount) : total - Number(item.amount);
  }, base);
};
```

Use `adjustedAmount(asg)` in amount display and `PaymentButton` amount prop.

- [ ] **Step 5: Run web verification**

Run: `pnpm --filter web lint`

Expected: oxlint exits successfully.

Run: `pnpm --filter web build`

Expected: Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/controllers/dashboard.js apps/web/src/pages/admin/Dashboard.jsx apps/web/src/pages/cashier/Collections.jsx apps/web/src/pages/cashier/Deposits.jsx apps/web/src/pages/guardian/Payment.jsx apps/web/src/pages/guardian/Receipts.jsx
git commit -m "feat: improve production financial workflows"
```

---

### Task 13: Health Checks, Environment Example, And Production Docs

**Files:**
- Create: `.env.example`
- Create: `apps/api/src/routes/health.js`
- Create: `docs/production-checklist.md`
- Modify: `apps/api/src/index.js`
- Modify: `README.md`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: `healthRouter` mounted at `/health` and `/ready`.
- Consumes: Prisma client from `apps/api/src/config/db.js`.

- [ ] **Step 1: Create health routes**

Create `apps/api/src/routes/health.js`:

```javascript
const express = require('express');
const prisma = require('../config/db');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', requestId: req.requestId });
});

router.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready', database: 'ok', requestId: req.requestId });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', database: 'error', requestId: req.requestId });
  }
});

module.exports = router;
```

In `apps/api/src/index.js`, import and mount before API routes:

```javascript
const healthRouter = require('./routes/health');
app.use(healthRouter);
```

- [ ] **Step 2: Create environment template**

Create `.env.example`:

```bash
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/smart_school
FRONTEND_URL=http://localhost:3000
JWT_SECRET=replace-with-at-least-32-characters
ENCRYPTION_KEY=replace-with-at-least-32-characters
CASHFREE_CLIENT_ID=replace-me
CASHFREE_CLIENT_SECRET=replace-me
CASHFREE_BASE_URL=https://sandbox.cashfree.com/pg
CASHFREE_WEBHOOK_SECRET=replace-me
```

- [ ] **Step 3: Create production checklist**

Create `docs/production-checklist.md`:

```markdown
# Production Checklist

- `NODE_ENV=production` is set.
- `JWT_SECRET` is unique and at least 32 characters.
- `ENCRYPTION_KEY` is unique and at least 32 characters.
- `DATABASE_URL` points to managed PostgreSQL with backups.
- `FRONTEND_URL` is the deployed web origin.
- Cashfree credentials are production credentials.
- Database migrations have been applied.
- `pnpm --filter smart-school-api test` passes.
- `pnpm --filter web lint` passes.
- `pnpm --filter web build` passes.
- `/health` returns `200`.
- `/ready` returns `200` after DB connectivity is verified.
- Admin account creation is controlled and staff accounts are admin-created.
- Audit logs are checked for redaction before launch.
```

- [ ] **Step 4: Update README production section**

Append to `README.md`:

````markdown
## Production Readiness

Before deployment, copy `.env.example` to the target environment and replace every secret. The API refuses production startup when required secrets are missing or too short. Run `pnpm --filter smart-school-api db:generate`, apply migrations, then verify `/health` and `/ready`.

Required release checks:

```bash
pnpm --filter smart-school-api test
pnpm --filter web lint
pnpm --filter web build
pnpm test
```
````

- [ ] **Step 5: Run verification**

Run: `pnpm --filter smart-school-api test`

Expected: PASS.

Run: `pnpm --filter web build`

Expected: Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add .env.example apps/api/src/routes/health.js apps/api/src/index.js docs/production-checklist.md README.md docker-compose.yml
git commit -m "docs: add production readiness checklist"
```

---

### Task 14: Final Release Gate

**Files:**
- Create: `scripts/verify-production-readiness.js`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Produces root script: `verify:production`.
- Consumes existing pnpm scripts: `test`, `web build`, `web lint`, `api test`.

- [ ] **Step 1: Create production verification script**

Create `scripts/verify-production-readiness.js`:

```javascript
const { execSync } = require('child_process');

const commands = [
  'pnpm --filter smart-school-api db:generate',
  'pnpm --filter smart-school-api test',
  'pnpm --filter web lint',
  'pnpm --filter web build',
  'pnpm test'
];

for (const command of commands) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

console.log('\nProduction readiness checks completed successfully.');
```

- [ ] **Step 2: Add root script**

In root `package.json`, add:

```json
"verify:production": "node scripts/verify-production-readiness.js"
```

- [ ] **Step 3: Run final verification**

Run: `pnpm verify:production`

Expected: all commands complete successfully and print `Production readiness checks completed successfully.`

- [ ] **Step 4: Manual role journey verification**

Run: `pnpm dev`

Expected: API on `http://localhost:5000`, web on `http://localhost:3000`.

Verify manually:

```text
1. Guardian signs up and sees only their ward.
2. Admin creates cashier via admin-only staff route.
3. Guardian submits KYC.
4. Admin approves KYC and fee assignments are created once.
5. Guardian initiates UPI payment; production success requires webhook.
6. Cashier records cash; receipt is generated immediately.
7. Cashier records cheque; receipt is generated only after clear.
8. Bounced cheque reopens fee and applies penalty.
9. Offline cashier queue sync returns per-item status.
10. Reconciliation upload creates persistent matched and unmatched rows.
11. Guardian cannot download another guardian receipt.
12. Audit logs contain redacted sensitive data.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-production-readiness.js package.json README.md
git commit -m "chore: add production readiness verification"
```

---

## Execution Guidance For AI Agents

- Execute one task at a time.
- Before each task, inspect the listed files because this repo may be dirty and user changes must not be overwritten.
- Write the test first when the task includes a test.
- Run the exact task verification before committing.
- If a verification command fails, stop and fix the failing task before moving on.
- Do not introduce dependencies not listed in this plan without asking the user.
- Do not delete the existing untracked plan/spec files unless the user asks.
- If schema migration conflicts with existing data, preserve data and add a safe migration path.

## Self-Review Notes

- Security coverage maps to Tasks 1, 2, 7, 10, and 13.
- DB consistency coverage maps to Tasks 3, 4, 5, 6, 8, and 9.
- Ledger correctness coverage maps to Tasks 4, 5, 6, 8, 9, and 12.
- Frontend production UX coverage maps to Tasks 8, 11, and 12.
- Operational readiness coverage maps to Tasks 13 and 14.
- This plan intentionally does not add Redis, Tailwind, shadcn/ui, Playwright, or Supertest to honor the current-stack constraint.
