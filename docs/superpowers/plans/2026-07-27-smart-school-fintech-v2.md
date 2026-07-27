# Smart School FinTech v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Smart School Fee Management System to a production-ready, scalable, and secure platform.

**Architecture:** Modular refactor - add Tailwind CSS, Redis caching, input validation, notification services, and comprehensive tests while preserving all existing business logic.

**Tech Stack:** React 19, Vite, Tailwind CSS, Zustand, Framer Motion, Node.js, Express, Prisma ORM, PostgreSQL, Redis, Jest, Supertest, Playwright

## Global Constraints

- Node.js >= 18.0.0
- PostgreSQL >= 14.0
- Redis >= 7.0
- All new code must have tests
- No breaking changes to existing API endpoints
- All sensitive data must be encrypted at rest

---

## Phase 1: Foundation (Weeks 1-2)

### Task 1: Database Optimization and Indexes

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/add_indexes.sql`

- [ ] **Step 1: Add performance indexes to Prisma schema**

Add to Transaction model in `prisma/schema.prisma`:
```prisma
model Transaction {
  // ... existing fields ...
  @@map("transactions")
  @@index([studentId])
  @@index([status])
  @@index([createdAt])
  @@index([feeAssignmentId])
}
```

Add to FeeAssignment model:
```prisma
model FeeAssignment {
  // ... existing fields ...
  @@map("fee_assignments")
  @@index([studentId])
  @@index([status])
  @@index([dueDate])
  @@index([feeStructureId])
}
```

Add to AuditLog model:
```prisma
model AuditLog {
  // ... existing fields ...
  @@map("audit_logs")
  @@index([actorId])
  @@index([action])
  @@index([entity])
  @@index([createdAt])
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api
npx prisma migrate dev --name add_performance_indexes
```

- [ ] **Step 3: Verify and commit**

```bash
npx prisma db push
git add prisma/schema.prisma
git commit -m "feat: add database performance indexes"
```

---

### Task 2: Redis Configuration

**Files:**
- Create: `apps/api/src/config/redis.js`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Install Redis dependency**

```bash
cd apps/api
npm install redis
```

- [ ] **Step 2: Create Redis client**

```javascript
// apps/api/src/config/redis.js
const { createClient } = require('redis');

let redisClient = null;

const getRedisClient = async () => {
  if (redisClient && redisClient.isOpen) return redisClient;

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  redisClient.on('error', (err) => console.error('Redis Error:', err));
  redisClient.on('connect', () => console.log('Redis Connected'));

  await redisClient.connect();
  return redisClient;
};

const cacheGet = async (key) => {
  try {
    const client = await getRedisClient();
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch { return null; }
};

const cacheSet = async (key, value, ttl = 300) => {
  try {
    const client = await getRedisClient();
    await client.setEx(key, ttl, JSON.stringify(value));
    return true;
  } catch { return false; }
};

const cacheDel = async (key) => {
  try {
    const client = await getRedisClient();
    await client.del(key);
    return true;
  } catch { return false; }
};

module.exports = { getRedisClient, cacheGet, cacheSet, cacheDel };
```

- [ ] **Step 3: Update .env.example and commit**

Add `REDIS_URL=redis://localhost:6379` to `.env.example`.

```bash
git add apps/api/src/config/redis.js apps/api/package.json apps/api/.env.example
git commit -m "feat: add Redis caching configuration"
```

---

### Task 3: Input Validation Middleware

**Files:**
- Create: `apps/api/src/middlewares/validation.js`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install Joi**

```bash
cd apps/api
npm install joi
```

- [ ] **Step 2: Create validation middleware**

```javascript
// apps/api/src/middlewares/validation.js
const Joi = require('joi');

const signupSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  mobile: Joi.string().pattern(/^[0-9]{10}$/).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string().valid('admin', 'cashier', 'employee', 'guardian').optional(),
  studentName: Joi.string().min(2).max(100).optional(),
  studentClass: Joi.string().max(50).optional(),
  studentDob: Joi.date().iso().optional()
});

const loginSchema = Joi.object({
  mobile: Joi.string().pattern(/^[0-9]{10}$/).required(),
  password: Joi.string().required()
});

const verifyOtpSchema = Joi.object({
  mobile: Joi.string().pattern(/^[0-9]{10}$/).required(),
  otp: Joi.string().pattern(/^[0-9]{6}$/).required()
});

const initiatePaymentSchema = Joi.object({
  feeAssignmentId: Joi.number().integer().positive().required(),
  method: Joi.string().valid('UPI').required(),
  idempotencyKey: Joi.string().min(10).max(100).required()
});

const collectManualSchema = Joi.object({
  feeAssignmentId: Joi.number().integer().positive().required(),
  method: Joi.string().valid('CASH', 'CHEQUE').required(),
  chequeNo: Joi.when('method', { is: 'CHEQUE', then: Joi.string().min(6).max(20).required() }),
  bank: Joi.when('method', { is: 'CHEQUE', then: Joi.string().min(2).max(100).required() }),
  deposited: Joi.boolean().optional()
});

const feeStructureSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  amount: Joi.number().positive().precision(2).required(),
  type: Joi.string().valid('tuition', 'transport', 'late_fee', 'other').required(),
  appliesTo: Joi.string().max(50).required(),
  academicYearId: Joi.number().integer().positive().required()
});

const feeAssignmentSchema = Joi.object({
  studentId: Joi.number().integer().positive().required(),
  feeStructureId: Joi.number().integer().positive().required(),
  dueDate: Joi.date().iso().required()
});

const kycSchema = Joi.object({
  studentId: Joi.number().integer().positive().required(),
  docType: Joi.string().valid('aadhaar', 'birth_certificate').required(),
  docRef: Joi.string().max(50).optional(),
  ocrData: Joi.object().required()
});

const reportSchema = Joi.object({
  type: Joi.string().valid('fee_summary', 'collection', 'defaulter', 'audit').required(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  format: Joi.string().valid('pdf', 'csv').required(),
  filters: Joi.object().optional()
});

const bulkAssignSchema = Joi.object({
  studentIds: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required(),
  feeStructureId: Joi.number().integer().positive().required(),
  dueDate: Joi.date().iso().required()
});

const bulkPaymentSchema = Joi.object({
  payments: Joi.array().items(Joi.object({
    feeAssignmentId: Joi.number().integer().positive().required(),
    method: Joi.string().valid('CASH', 'CHEQUE').required(),
    chequeNo: Joi.when('method', { is: 'CHEQUE', then: Joi.string().min(6).max(20).required() }),
    bank: Joi.when('method', { is: 'CHEQUE', then: Joi.string().min(2).max(100).required() })
  })).min(1).max(50).required()
});

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });
    }
    req[property] = value;
    next();
  };
};

module.exports = { validate, schemas: {
  signup: signupSchema, login: loginSchema, verifyOtp: verifyOtpSchema,
  initiatePayment: initiatePaymentSchema, collectManual: collectManualSchema,
  feeStructure: feeStructureSchema, feeAssignment: feeAssignmentSchema,
  kyc: kycSchema, report: reportSchema,
  bulkAssign: bulkAssignSchema, bulkPayment: bulkPaymentSchema
}};
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/middlewares/validation.js apps/api/package.json
git commit -m "feat: add input validation middleware with Joi schemas"
```

---

### Task 4: Security Headers Middleware

**Files:**
- Create: `apps/api/src/middlewares/security.js`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Install Helmet**

```bash
cd apps/api
npm install helmet
```

- [ ] **Step 2: Create security middleware**

```javascript
// apps/api/src/middlewares/security.js
const helmet = require('helmet');

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
});

module.exports = { securityHeaders };
```

- [ ] **Step 3: Wire into Express**

Add after `app.use(cors())` in `apps/api/src/index.js`:
```javascript
const { securityHeaders } = require('./middlewares/security');
app.use(securityHeaders);
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/middlewares/security.js apps/api/src/index.js apps/api/package.json
git commit -m "feat: add Helmet security headers middleware"
```

---

### Task 5: Data Encryption Utility

**Files:**
- Create: `apps/api/src/utils/encryption.js`

- [ ] **Step 1: Create encryption utility**

```javascript
// apps/api/src/utils/encryption.js
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'), 'hex');

const encrypt = (text) => {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

const decrypt = (encryptedText) => {
  if (!encryptedText) return null;
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = { encrypt, decrypt };
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/utils/encryption.js
git commit -m "feat: add AES-256-GCM field-level encryption utility"
```

---

### Task 6: Tailwind CSS Setup (Frontend)

**Files:**
- Create: `apps/web/tailwind.config.js`
- Create: `apps/web/postcss.config.js`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install Tailwind CSS**

```bash
cd apps/web
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Create Tailwind config**

```javascript
// apps/web/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e' },
        secondary: { 50: '#faf5ff', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706' },
        error: { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626' },
        surface: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 800: '#1e293b', 900: '#0f172a' }
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { sm: '4px', md: '8px', lg: '12px', xl: '16px' },
      boxShadow: { glass: '0 8px 32px rgba(0, 0, 0, 0.1)', card: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }
    }
  },
  plugins: []
}
```

- [ ] **Step 3: Create PostCSS config**

```javascript
// apps/web/postcss.config.js
export default {
  plugins: {
    '@tailwindcss/vite': {}
  }
}
```

- [ ] **Step 4: Update Vite config for Tailwind**

Modify `apps/web/vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:5000' } }
})
```

- [ ] **Step 5: Update index.css**

Replace contents of `apps/web/src/index.css`:
```css
@import "tailwindcss";

:root {
  --primary: #0ea5e9;
  --secondary: #8b5cf6;
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --glass-bg: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.1);
  --text-primary: #ffffff;
  --text-secondary: #94a3b8;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
  color: #ffffff;
  min-height: 100vh;
}

.glass-panel {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  backdrop-filter: blur(12px);
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/tailwind.config.js apps/web/postcss.config.js apps/web/vite.config.js apps/web/src/index.css apps/web/package.json
git commit -m "feat: set up Tailwind CSS with design tokens"
```

---

### Task 7: Testing Infrastructure Setup

**Files:**
- Create: `apps/api/jest.config.js`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install test dependencies**

```bash
cd apps/api
npm install -D jest @jest/globals supertest
```

- [ ] **Step 2: Create Jest config**

```javascript
// apps/api/jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageThreshold: { global: { branches: 50, functions: 50, lines: 50, statements: 50 } },
  setupFilesAfterSetup: [],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true
};
```

- [ ] **Step 3: Update test script in package.json**

Change test script to:
```json
"test": "jest --runInBand",
"test:coverage": "jest --runInBand --coverage"
```

- [ ] **Step 4: Create test directory structure**

```bash
mkdir -p apps/api/tests/unit apps/api/tests/integration apps/api/tests/e2e
```

- [ ] **Step 5: Create first unit test**

```javascript
// apps/api/tests/unit/fee-calculator.test.js
describe('Fee Calculator', () => {
  test('calculates late fee correctly', () => {
    const dueDate = new Date('2026-01-01');
    const currentDate = new Date('2026-01-10');
    const graceDays = 7;
    const lateFeeRate = 0.01;
    const baseAmount = 1000;

    const overdueDays = Math.max(0, Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24)) - graceDays);
    const lateFee = Math.round(baseAmount * lateFeeRate * overdueDays);

    expect(overdueDays).toBe(2);
    expect(lateFee).toBe(20);
  });

  test('no late fee within grace period', () => {
    const dueDate = new Date('2026-01-01');
    const currentDate = new Date('2026-01-05');
    const graceDays = 7;
    const lateFeeRate = 0.01;
    const baseAmount = 1000;

    const overdueDays = Math.max(0, Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24)) - graceDays);
    const lateFee = Math.round(baseAmount * lateFeeRate * overdueDays);

    expect(overdueDays).toBe(0);
    expect(lateFee).toBe(0);
  });
});
```

- [ ] **Step 6: Run tests and commit**

```bash
npx jest tests/unit/fee-calculator.test.js --verbose
git add apps/api/jest.config.js apps/api/package.json apps/api/tests/
git commit -m "feat: set up Jest testing infrastructure"
```

---

## Phase 2: Core Improvements (Weeks 3-4)

### Task 8: Tailwind UI Component Library

**Files:**
- Create: `apps/web/src/components/ui/Button.jsx`
- Create: `apps/web/src/components/ui/Card.jsx`
- Create: `apps/web/src/components/ui/Input.jsx`
- Create: `apps/web/src/components/ui/Modal.jsx`
- Create: `apps/web/src/components/ui/Table.jsx`
- Create: `apps/web/src/components/ui/index.js`

- [ ] **Step 1: Create Button component**

```jsx
// apps/web/src/components/ui/Button.jsx
import React from 'react';

const variants = {
  primary: 'bg-primary-500 hover:bg-primary-600 text-white shadow-lg shadow-primary-500/25',
  secondary: 'bg-surface-800 hover:bg-surface-700 text-surface-200 border border-surface-700',
  ghost: 'bg-transparent hover:bg-surface-800 text-surface-200',
  danger: 'bg-error-500 hover:bg-error-600 text-white shadow-lg shadow-error-500/25',
  success: 'bg-success-500 hover:bg-success-600 text-white'
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base'
};

export default function Button({ variant = 'primary', size = 'md', children, disabled, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Create Card component**

```jsx
// apps/web/src/components/ui/Card.jsx
import React from 'react';

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`glass-panel p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function StatCard({ title, value, icon, color = 'bg-primary-500/20', trend, trendUp }) {
  return (
    <Card className="flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      <div className="flex-1">
        <p className="text-sm text-surface-200">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {trend && (
          <p className={`text-xs ${trendUp ? 'text-success-500' : 'text-error-500'}`}>
            {trendUp ? '+' : ''}{trend}% from last month
          </p>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Create Input component**

```jsx
// apps/web/src/components/ui/Input.jsx
import React from 'react';

export default function Input({ label, error, className = '', ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-surface-200">{label}</label>}
      <input
        className={`w-full px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-white placeholder-surface-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all ${error ? 'border-error-500' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-error-500">{error}</p>}
    </div>
  );
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-surface-200">{label}</label>}
      <select
        className={`w-full px-4 py-2.5 bg-surface-800 border border-surface-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all ${error ? 'border-error-500' : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-error-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Create Modal component**

```jsx
// apps/web/src/components/ui/Modal.jsx
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`w-full ${sizes[size]} bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-surface-700">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button onClick={onClose} className="p-2 hover:bg-surface-800 rounded-lg transition-colors text-surface-200">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 5: Create Table component**

```jsx
// apps/web/src/components/ui/Table.jsx
import React from 'react';

export default function Table({ columns, data, onRowClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-700">
            {columns.map((col, i) => (
              <th key={i} className="px-4 py-3 text-left font-medium text-surface-200">{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={`border-b border-surface-800 hover:bg-surface-800/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col, colIdx) => (
                <td key={colIdx} className="px-4 py-3 text-white">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Create barrel export and commit**

```javascript
// apps/web/src/components/ui/index.js
export { default as Button } from './Button';
export { Card, StatCard } from './Card';
export { default as Input, Select } from './Input';
export { default as Modal } from './Modal';
export { default as Table } from './Table';
```

```bash
git add apps/web/src/components/ui/
git commit -m "feat: create Tailwind UI component library"
```

---

### Task 9: Notification Service

**Files:**
- Create: `apps/api/src/services/notification.js`
- Create: `apps/api/src/controllers/notifications.js`
- Modify: `apps/api/src/index.js`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Notification model to Prisma schema**

```prisma
model Notification {
  id          Int      @id @default(autoincrement())
  userId      Int      @map("user_id")
  type        String   @db.VarChar(20) // 'sms', 'email', 'in_app'
  template    String   @db.VarChar(50)
  subject     String?  @db.VarChar(255)
  message     String   @db.Text
  status      String   @default("pending") @db.VarChar(20) // 'pending', 'sent', 'failed'
  metadata    Json?
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamp()
  sentAt      DateTime? @map("sent_at") @db.Timestamp()

  @@map("notifications")
  @@index([userId])
  @@index([status])
  @@index([createdAt])
}
```

- [ ] **Step 2: Create notification service**

```javascript
// apps/api/src/services/notification.js
const prisma = require('../config/db');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const templates = {
  payment_success: (data) => ({
    subject: 'Payment Confirmation',
    message: `Dear ${data.guardianName}, a payment of INR ${data.amount} for your ward ${data.studentName} was successfully received. Receipt Number: ${data.receiptNumber}`
  }),
  overdue_reminder: (data) => ({
    subject: 'Fee Payment Reminder',
    message: `Dear ${data.guardianName}, please note that fees of INR ${data.amount} for your ward ${data.studentName} are overdue. Due date was ${data.dueDate}.`
  }),
  kyc_update: (data) => ({
    subject: 'KYC Status Update',
    message: `Dear ${data.guardianName}, the KYC verification for ${data.studentName} has been ${data.status}.`
  }),
  receipt: (data) => ({
    subject: 'Fee Receipt',
    message: `Dear ${data.guardianName}, please find attached the receipt for payment of INR ${data.amount} for ${data.studentName}. Receipt: ${data.receiptNumber}`
  })
};

const createNotification = async ({ userId, type, template, data }) => {
  const tmpl = templates[template](data);
  return prisma.notification.create({
    data: { userId, type, template, subject: tmpl.subject, message: tmpl.message, metadata: data, status: 'pending' }
  });
};

const sendEmail = async (to, subject, message) => {
  if (!process.env.SMTP_USER) {
    console.log(`[EMAIL MOCK] To: ${to}, Subject: ${subject}, Message: ${message}`);
    return true;
  }
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text: message });
  return true;
};

const sendSMS = async (mobile, message) => {
  console.log(`[SMS MOCK] To: ${mobile}, Message: ${message}`);
  return true;
};

const processNotification = async (notificationId) => {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId }, include: { user: true } });
  if (!notification || notification.status !== 'pending') return;

  try {
    const to = notification.user.email;
    const mobile = notification.user.mobile;

    if (notification.type === 'email') {
      await sendEmail(to, notification.subject, notification.message);
    } else if (notification.type === 'sms') {
      await sendSMS(mobile, notification.message);
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'sent', sentAt: new Date() }
    });
  } catch (error) {
    console.error('Notification send failed:', error);
    await prisma.notification.update({ where: { id: notificationId }, data: { status: 'failed' } });
  }
};

const notifyPaymentSuccess = async (transaction, student, guardian, feeStructure, receiptNumber) => {
  const notif = await createNotification({
    userId: guardian.id, type: 'sms', template: 'payment_success',
    data: { guardianName: guardian.name, studentName: student.name, amount: feeStructure.amount, receiptNumber }
  });
  processNotification(notif.id);
  const emailNotif = await createNotification({
    userId: guardian.id, type: 'email', template: 'payment_success',
    data: { guardianName: guardian.name, studentName: student.name, amount: feeStructure.amount, receiptNumber }
  });
  processNotification(emailNotif.id);
};

const notifyOverdueReminder = async (student, guardian, feeAssignment, feeStructure) => {
  const notif = await createNotification({
    userId: guardian.id, type: 'sms', template: 'overdue_reminder',
    data: { guardianName: guardian.name, studentName: student.name, amount: feeStructure.amount, dueDate: feeAssignment.dueDate }
  });
  processNotification(notif.id);
};

const getUserNotifications = async (userId, limit = 20) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
};

const markAsRead = async (notificationId, userId) => {
  return prisma.notification.update({
    where: { id: notificationId, userId },
    data: { status: 'read' }
  });
};

module.exports = {
  createNotification, processNotification, notifyPaymentSuccess,
  notifyOverdueReminder, getUserNotifications, markAsRead, templates
};
```

- [ ] **Step 3: Install nodemailer and run migration**

```bash
cd apps/api
npm install nodemailer
npx prisma migrate dev --name add_notifications
```

- [ ] **Step 4: Create notification controller**

```javascript
// apps/api/src/controllers/notifications.js
const { getUserNotifications, markAsRead } = require('../services/notification');

const getNotifications = async (req, res) => {
  try {
    const notifications = await getUserNotifications(req.user.id);
    res.status(200).json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await markAsRead(Number(id), req.user.id);
    res.status(200).json(notification);
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getNotifications, markNotificationRead };
```

- [ ] **Step 5: Wire routes and commit**

Add to `apps/api/src/index.js`:
```javascript
const notificationsController = require('./controllers/notifications');

app.get('/api/notifications', authenticate, notificationsController.getNotifications);
app.put('/api/notifications/:id/read', authenticate, notificationsController.markNotificationRead);
```

```bash
git add apps/api/src/services/notification.js apps/api/src/controllers/notifications.js apps/api/src/index.js prisma/schema.prisma apps/api/package.json
git commit -m "feat: add notification service with SMS and email channels"
```

---

### Task 10: Report Generation Service

**Files:**
- Create: `apps/api/src/services/report.js`
- Create: `apps/api/src/controllers/reports.js`
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Create report service**

```javascript
// apps/api/src/services/report.js
const PDFDocument = require('pdfkit');
const prisma = require('../config/db');

const generateFeeSummaryReport = async (filters = {}) => {
  const { startDate, endDate } = filters;
  const where = {};
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const transactions = await prisma.transaction.findMany({
    where: { ...where, status: 'success' },
    include: { student: true, feeAssignment: { include: { feeStructure: true } } }
  });

  const summary = {
    totalCollected: transactions.reduce((sum, t) => sum + Number(t.amount), 0),
    totalTransactions: transactions.length,
    byMethod: {
      UPI: transactions.filter(t => t.method === 'UPI').reduce((sum, t) => sum + Number(t.amount), 0),
      CASH: transactions.filter(t => t.method === 'CASH').reduce((sum, t) => sum + Number(t.amount), 0),
      CHEQUE: transactions.filter(t => t.method === 'CHEQUE').reduce((sum, t) => sum + Number(t.amount), 0)
    },
    transactions: transactions.map(t => ({
      id: t.id, student: t.student.name, fee: t.feeAssignment.feeStructure.name,
      amount: Number(t.amount), method: t.method, date: t.createdAt, receipt: t.receiptNumber
    }))
  };

  return summary;
};

const generateDefaulterReport = async () => {
  const overdueAssignments = await prisma.feeAssignment.findMany({
    where: { status: { in: ['pending', 'overdue'] }, dueDate: { lt: new Date() } },
    include: { student: { include: { guardian: true } }, feeStructure: true }
  });

  return overdueAssignments.map(a => ({
    student: a.student.name, guardian: a.student.guardian.name,
    mobile: a.student.guardian.mobile, fee: a.feeStructure.name,
    amount: Number(a.feeStructure.amount), dueDate: a.dueDate,
    overdueDays: Math.floor((new Date() - new Date(a.dueDate)) / (1000 * 60 * 60 * 24))
  }));
};

const generatePDF = (data, title) => {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));

    doc.fontSize(20).text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`);
    doc.moveDown();

    if (data.transactions) {
      doc.fontSize(12).text('Transactions:');
      data.transactions.forEach((t) => {
        doc.fontSize(9).text(`${t.date} | ${t.student} | ${t.fee} | INR ${t.amount} | ${t.method} | ${t.receipt || 'N/A'}`);
      });
    }

    doc.moveDown();
    doc.fontSize(12).text(`Total: INR ${data.totalCollected || 0}`);
    doc.end();
  });
};

module.exports = { generateFeeSummaryReport, generateDefaulterReport, generatePDF };
```

- [ ] **Step 2: Create report controller**

```javascript
// apps/api/src/controllers/reports.js
const { generateFeeSummaryReport, generateDefaulterReport, generatePDF } = require('../services/report');

const generateReport = async (req, res) => {
  try {
    const { type, format, startDate, endDate } = req.body;

    let reportData;
    switch (type) {
      case 'fee_summary':
        reportData = await generateFeeSummaryReport({ startDate, endDate });
        break;
      case 'defaulter':
        reportData = await generateDefaulterReport();
        break;
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    if (format === 'csv') {
      const csv = convertToCSV(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_report.csv"`);
      return res.send(csv);
    }

    const pdfBase64 = await generatePDF(reportData, `${type.replace(/_/g, ' ').toUpperCase()} REPORT`);
    res.status(200).json({ report: pdfBase64, data: reportData });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const convertToCSV = (data) => {
  const items = data.transactions || data;
  if (!items || items.length === 0) return '';
  const headers = Object.keys(items[0]).join(',');
  const rows = items.map(item => Object.values(item).join(',')).join('\n');
  return `${headers}\n${rows}`;
};

module.exports = { generateReport };
```

- [ ] **Step 3: Wire routes and commit**

Add to `apps/api/src/index.js`:
```javascript
const reportsController = require('./controllers/reports');
app.post('/api/reports/generate', authenticate, checkRole(['admin']), reportsController.generateReport);
```

```bash
npm install pdfkit
git add apps/api/src/services/report.js apps/api/src/controllers/reports.js apps/api/src/index.js apps/api/package.json
git commit -m "feat: add report generation service with PDF and CSV export"
```

---

### Task 11: Bulk Operations Service

**Files:**
- Create: `apps/api/src/services/bulk.js`
- Create: `apps/api/src/controllers/bulk.js`
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Create bulk operations service**

```javascript
// apps/api/src/services/bulk.js
const prisma = require('../config/db');

const bulkAssignFees = async (studentIds, feeStructureId, dueDate) => {
  const results = { success: 0, failed: 0, errors: [] };

  const feeStructure = await prisma.feeStructure.findUnique({ where: { id: feeStructureId } });
  if (!feeStructure) throw new Error('Fee structure not found');

  for (const studentId of studentIds) {
    try {
      const existing = await prisma.feeAssignment.findFirst({
        where: { studentId, feeStructureId, status: { in: ['pending', 'overdue'] } }
      });
      if (existing) {
        results.errors.push({ studentId, error: 'Assignment already exists' });
        results.failed++;
        continue;
      }

      await prisma.feeAssignment.create({
        data: { studentId, feeStructureId, dueDate: new Date(dueDate), status: 'pending' }
      });
      results.success++;
    } catch (error) {
      results.errors.push({ studentId, error: error.message });
      results.failed++;
    }
  }

  return results;
};

const bulkProcessPayments = async (payments, cashierId) => {
  const results = { success: 0, failed: 0, errors: [] };

  for (const payment of payments) {
    try {
      const assignment = await prisma.feeAssignment.findUnique({
        where: { id: payment.feeAssignmentId },
        include: { student: true, feeStructure: true }
      });

      if (!assignment) {
        results.errors.push({ feeAssignmentId: payment.feeAssignmentId, error: 'Assignment not found' });
        results.failed++;
        continue;
      }

      if (assignment.status === 'paid') {
        results.errors.push({ feeAssignmentId: payment.feeAssignmentId, error: 'Already paid' });
        results.failed++;
        continue;
      }

      const amount = Number(assignment.feeStructure.amount);

      await prisma.$transaction(async (tx) => {
        const currentYear = new Date().getFullYear();
        const successTxs = await tx.transaction.findMany({
          where: { status: 'success', receiptNumber: { startsWith: `REC-${currentYear}-` } }
        });

        let nextNum = 1;
        if (successTxs.length > 0) {
          const nums = successTxs.map(t => parseInt(t.receiptNumber.split('-')[2] || '0', 10));
          nextNum = Math.max(...nums) + 1;
        }
        const receiptNumber = `REC-${currentYear}-${String(nextNum).padStart(4, '0')}`;

        await tx.transaction.create({
          data: {
            studentId: assignment.studentId, feeAssignmentId: assignment.id, amount,
            method: payment.method, status: 'success', receiptNumber,
            idempotencyKey: `BULK_${assignment.id}_${Date.now()}`
          }
        });

        await tx.feeAssignment.update({ where: { id: assignment.id }, data: { status: 'paid' } });

        await tx.auditLog.create({
          data: {
            actorId: cashierId, actorRole: 'cashier', action: 'bulk_payment',
            entity: 'transaction', entityId: assignment.id, after: { method: payment.method, amount }
          }
        });
      });

      results.success++;
    } catch (error) {
      results.errors.push({ feeAssignmentId: payment.feeAssignmentId, error: error.message });
      results.failed++;
    }
  }

  return results;
};

module.exports = { bulkAssignFees, bulkProcessPayments };
```

- [ ] **Step 2: Create bulk controller**

```javascript
// apps/api/src/controllers/bulk.js
const { bulkAssignFees, bulkProcessPayments } = require('../services/bulk');

const assignFees = async (req, res) => {
  try {
    const { studentIds, feeStructureId, dueDate } = req.body;
    const results = await bulkAssignFees(studentIds, feeStructureId, dueDate);
    res.status(200).json({ message: 'Bulk assignment completed', results });
  } catch (error) {
    console.error('Bulk assign error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const processPayments = async (req, res) => {
  try {
    const { payments } = req.body;
    const results = await bulkProcessPayments(payments, req.user.id);
    res.status(200).json({ message: 'Bulk payment processing completed', results });
  } catch (error) {
    console.error('Bulk payment error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = { assignFees, processPayments };
```

- [ ] **Step 3: Wire routes and commit**

Add to `apps/api/src/index.js`:
```javascript
const bulkController = require('./controllers/bulk');
app.post('/api/bulk/assign', authenticate, checkRole(['admin', 'cashier']), bulkController.assignFees);
app.post('/api/bulk/payments', authenticate, checkRole(['admin', 'cashier']), bulkController.processPayments);
```

```bash
git add apps/api/src/services/bulk.js apps/api/src/controllers/bulk.js apps/api/src/index.js
git commit -m "feat: add bulk operations service for fee assignment and payments"
```

---

### Task 12: Integration Tests

**Files:**
- Create: `apps/api/tests/integration/auth.test.js`
- Create: `apps/api/tests/integration/payments.test.js`

- [ ] **Step 1: Create auth integration test**

```javascript
// apps/api/tests/integration/auth.test.js
const request = require('supertest');
const express = require('express');

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  // Wire auth routes here or import from index
});

describe('Auth Endpoints', () => {
  describe('POST /api/auth/signup', () => {
    test('creates a new guardian account', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Test Guardian',
          mobile: '1234567890',
          email: 'test@example.com',
          password: 'password123'
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.name).toBe('Test Guardian');
    });

    test('rejects duplicate mobile', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Duplicate',
          mobile: '1234567890',
          email: 'dup@example.com',
          password: 'password123'
        });
      expect(res.status).toBe(400);
    });

    test('rejects invalid mobile format', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Invalid',
          mobile: '123',
          email: 'invalid@example.com',
          password: 'password123'
        });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    test('returns OTP for valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ mobile: '1234567890', password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('otp');
    });

    test('rejects invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ mobile: '1234567890', password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });
  });
});
```

- [ ] **Step 2: Create payments integration test**

```javascript
// apps/api/tests/integration/payments.test.js
const request = require('supertest');

describe('Payment Endpoints', () => {
  let adminToken, cashierToken, guardianToken;

  describe('POST /api/payments/collect-manual', () => {
    test('cashier can collect cash payment', async () => {
      const res = await request(app)
        .post('/api/payments/collect-manual')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ feeAssignmentId: 1, method: 'CASH', deposited: true });

      expect(res.status).toBe(201);
      expect(res.body.transaction).toHaveProperty('receiptNumber');
      expect(res.body.transaction.status).toBe('success');
    });

    test('rejects payment without auth', async () => {
      const res = await request(app)
        .post('/api/payments/collect-manual')
        .send({ feeAssignmentId: 1, method: 'CASH' });

      expect(res.status).toBe(401);
    });

    test('rejects invalid method', async () => {
      const res = await request(app)
        .post('/api/payments/collect-manual')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ feeAssignmentId: 1, method: 'INVALID' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/payments/transactions', () => {
    test('returns transactions list', async () => {
      const res = await request(app)
        .get('/api/payments/transactions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/integration/
git commit -m "feat: add integration tests for auth and payments"
```

---

## Phase 3: Advanced Features (Weeks 5-6)

### Task 13: Frontend Pages Refactor to Tailwind

**Files:**
- Modify: `apps/web/src/pages/admin/Dashboard.jsx`
- Modify: `apps/web/src/pages/guardian/Payment.jsx`
- Modify: `apps/web/src/pages/cashier/Collections.jsx`

- [ ] **Step 1: Refactor Dashboard to Tailwind**

Key changes in `apps/web/src/pages/admin/Dashboard.jsx`:
- Replace inline styles with Tailwind classes
- Use imported UI components (Card, StatCard, Button)
- Use Framer Motion for animations

Example pattern replacement:
```jsx
// Before
<div className="glass-panel" style={{ padding: '40px' }}>

// After
<Card className="p-8">
```

```jsx
// Before
<h2 style={{ fontSize: '1.25rem', marginBottom: '10px' }}>

// After
<h2 className="text-xl font-bold mb-2.5">
```

- [ ] **Step 2: Refactor Payment page to Tailwind**

Same pattern as above for `apps/web/src/pages/guardian/Payment.jsx`.

- [ ] **Step 3: Refactor Collections page to Tailwind**

Same pattern for `apps/web/src/pages/cashier/Collections.jsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/
git commit -m "feat: refactor admin dashboard to Tailwind CSS"
```

---

### Task 14: PWA Manifest and Service Worker

**Files:**
- Create: `apps/web/public/manifest.json`
- Create: `apps/web/public/sw.js`
- Modify: `apps/web/index.html`

- [ ] **Step 1: Create PWA manifest**

```json
{
  "name": "Smart School FinTech",
  "short_name": "SchoolFee",
  "description": "Digital fee payment and ledger management system",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0ea5e9",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create service worker**

```javascript
// apps/web/public/sw.js
const CACHE_NAME = 'smart-school-v1';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) =>
    Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
  ));
});
```

- [ ] **Step 3: Register service worker in index.html**

Add before `</head>`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0ea5e9" />
```

Add before `</body>`:
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
</script>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/public/manifest.json apps/web/public/sw.js apps/web/index.html
git commit -m "feat: add PWA manifest and service worker"
```

---

### Task 15: Notification Center (Frontend)

**Files:**
- Create: `apps/web/src/stores/notificationStore.js`
- Create: `apps/web/src/pages/guardian/Notifications.jsx`
- Modify: `apps/web/src/App.jsx`

- [ ] **Step 1: Create notification store**

```javascript
// apps/web/src/stores/notificationStore.js
import { create } from 'zustand';
import axios from 'axios';

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      set({
        notifications: res.data,
        unreadCount: res.data.filter(n => n.status === 'pending').length,
        loading: false
      });
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      set({ loading: false });
    }
  },

  markAsRead: async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/notifications/${id}/read`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      get().fetchNotifications();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }
}));
```

- [ ] **Step 2: Create Notifications page**

```jsx
// apps/web/src/pages/guardian/Notifications.jsx
import React, { useEffect } from 'react';
import { useNotificationStore } from '../../stores/notificationStore';
import { Card } from '../../components/ui';

export default function Notifications() {
  const { notifications, loading, fetchNotifications, markAsRead } = useNotificationStore();

  useEffect(() => { fetchNotifications(); }, []);

  return (
    <Card>
      <h2 className="text-xl font-bold mb-4">Notifications</h2>
      {loading ? (
        <p className="text-surface-200">Loading notifications...</p>
      ) : notifications.length === 0 ? (
        <p className="text-surface-200">No notifications yet.</p>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-4 rounded-lg border transition-all cursor-pointer ${
                notif.status === 'pending'
                  ? 'bg-primary-500/10 border-primary-500/30'
                  : 'bg-surface-800/50 border-surface-700'
              }`}
              onClick={() => notif.status === 'pending' && markAsRead(notif.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-white">{notif.subject}</p>
                  <p className="text-sm text-surface-200 mt-1">{notif.message}</p>
                </div>
                <span className="text-xs text-surface-200">
                  {new Date(notif.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-surface-700 text-surface-200">
                  {notif.type.toUpperCase()}
                </span>
                {notif.status === 'pending' && (
                  <span className="text-xs px-2 py-0.5 rounded bg-primary-500/20 text-primary-400">
                    New
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Add notification tab to guardian dashboard and commit**

```bash
git add apps/web/src/stores/notificationStore.js apps/web/src/pages/guardian/Notifications.jsx apps/web/src/App.jsx
git commit -m "feat: add notification center frontend"
```

---

## Phase 4: Polish and Deploy (Weeks 7-8)

### Task 16: E2E Tests with Playwright

**Files:**
- Create: `apps/web/tests/e2e/guardian-flow.spec.js`
- Create: `apps/web/playwright.config.js`

- [ ] **Step 1: Install Playwright**

```bash
cd apps/web
npm install -D @playwright/test
npx playwright install
```

- [ ] **Step 2: Create Playwright config**

```javascript
// apps/web/playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  webServer: { command: 'pnpm dev', port: 3000, reuseExistingServer: true }
});
```

- [ ] **Step 3: Create guardian flow test**

```javascript
// apps/web/tests/e2e/guardian-flow.spec.js
import { test, expect } from '@playwright/test';

test.describe('Guardian Flow', () => {
  test('guardian can login and view fees', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="mobile"]', '9696969696');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('text=My Wards')).toBeVisible();
  });

  test('guardian can navigate to payment page', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="mobile"]', '9696969696');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.click('text=Pay Fees');
    await expect(page.locator('text=Select Student Profile')).toBeVisible();
  });
});
```

- [ ] **Step 4: Run E2E tests and commit**

```bash
npx playwright test
git add apps/web/tests/e2e/ apps/web/playwright.config.js apps/web/package.json
git commit -m "feat: add E2E tests with Playwright"
```

---

### Task 17: Security Audit & Hardening

**Files:**
- Modify: `apps/api/src/index.js`
- Modify: `apps/api/src/middlewares/rbac.js`

- [ ] **Step 1: Add rate limiting to all endpoints**

```javascript
// In apps/api/src/index.js, add global rate limiter:
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);
```

- [ ] **Step 2: Add request body size limit**

```javascript
app.use(express.json({ limit: '1mb' }));
```

- [ ] **Step 3: Add CORS origin whitelist**

```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.js
git commit -m "feat: add security hardening - rate limiting, body size, CORS"
```

---

### Task 18: Environment Configuration & Documentation

**Files:**
- Modify: `apps/api/.env.example`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Update .env.example with all new variables**

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/smart_school

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# Encryption
ENCRYPTION_KEY=your-32-byte-hex-key

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourschool.com

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://yourschool.com

# Frontend
FRONTEND_URL=http://localhost:3000
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/.env.example
git commit -m "docs: update environment configuration with all variables"
```

---

### Task 19: Final Verification & Cleanup

- [ ] **Step 1: Run all tests**

```bash
cd apps/api && npm test
cd apps/web && npx playwright test
```

- [ ] **Step 2: Run lint**

```bash
cd apps/web && npx oxlint src/
```

- [ ] **Step 3: Build frontend**

```bash
cd apps/web && npm run build
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```

---

## Summary

| Phase | Tasks | Duration |
|-------|-------|----------|
| Phase 1: Foundation | Tasks 1-7 | Weeks 1-2 |
| Phase 2: Core Improvements | Tasks 8-12 | Weeks 3-4 |
| Phase 3: Advanced Features | Tasks 13-15 | Weeks 5-6 |
| Phase 4: Polish & Deploy | Tasks 16-19 | Weeks 7-8 |
