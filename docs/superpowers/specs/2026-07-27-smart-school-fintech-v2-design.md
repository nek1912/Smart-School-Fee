# Smart School FinTech v2 - Design Specification

**Date:** 2026-07-27
**Version:** 2.0
**Status:** Approved

## Executive Summary

This document outlines the design for upgrading the Smart School Fee Management System from a functional prototype to a production-ready, scalable, and secure platform. The improvements focus on three pillars: Security Hardening, Feature Completeness, and Architecture Quality.

## 1. Architecture Overview

### Current State
- Monorepo with `apps/api` (Express) and `apps/web` (React/Vite)
- PostgreSQL with Prisma ORM
- Inline CSS styles, no design system
- Basic RBAC, audit logging, rate limiting

### Proposed Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Smart School FinTech v2                   │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React 19 + Vite + Tailwind CSS)                  │
│  ├── Pages (Admin, Cashier, Guardian)                       │
│  ├── Components (shadcn/ui + custom)                        │
│  ├── Hooks (useDashboardQuery, useNotifications)            │
│  └── Stores (Zustand: auth, notifications, theme)           │
├─────────────────────────────────────────────────────────────┤
│  Backend (Node.js + Express)                                │
│  ├── Controllers (refactored, input validation)             │
│  ├── Middlewares (RBAC, audit, rate-limit, validation)      │
│  ├── Services (notification, report, bulk)                  │
│  └── Utils (encryption, PDF generation, CSV export)         │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ├── PostgreSQL (Prisma ORM, optimized indexes)             │
│  ├── Redis (caching, sessions, rate-limiting)               │
│  └── S3/Local (file storage for receipts, reports)          │
└─────────────────────────────────────────────────────────────┘
```

### Key Changes
1. Add Tailwind CSS for consistent styling
2. Add Redis for caching and sessions
3. Add service layer for business logic
4. Add input validation middleware
5. Add notification service (SMS, Email, In-app)

## 2. Database & Performance

### Database Optimization
```sql
-- Add indexes for frequently queried fields
CREATE INDEX idx_transactions_student_id ON transactions(student_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_fee_assignments_student_id ON fee_assignments(student_id);
CREATE INDEX idx_fee_assignments_status ON fee_assignments(status);
CREATE INDEX idx_fee_assignments_due_date ON fee_assignments(due_date);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

### Redis Caching Strategy
```
┌─────────────────────────────────────────┐
│           Redis Cache Layers            │
├─────────────────────────────────────────┤
│ 1. Session Cache (JWT tokens)           │
│    - TTL: 24 hours                      │
│    - Key: session:{userId}              │
│                                         │
│ 2. Dashboard Metrics Cache              │
│    - TTL: 30 seconds                    │
│    - Key: dashboard:metrics             │
│                                         │
│ 3. Fee Structure Cache                  │
│    - TTL: 5 minutes                     │
│    - Key: fee:structures:{yearId}       │
│                                         │
│ 4. Rate Limiting Counters               │
│    - TTL: 15 minutes                    │
│    - Key: ratelimit:{ip}:{endpoint}     │
└─────────────────────────────────────────┘
```

### Connection Pooling
- Prisma connection pool: 10 connections
- Redis connection pool: 5 connections
- Graceful shutdown handling

## 3. Security Hardening

### 1. Input Validation Middleware
```javascript
// Example: Joi/Zod validation schema
const validatePayment = (req, res, next) => {
  const schema = Joi.object({
    feeAssignmentId: Joi.number().required(),
    method: Joi.string().valid('UPI', 'CASH', 'CHEQUE').required(),
    idempotencyKey: Joi.string().min(10).max(100).required()
  });
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  next();
};
```

### 2. Security Headers
```javascript
// Helmet.js configuration
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
  }
}));
```

### 3. Data Encryption
- Encrypt sensitive fields (bank account, IFSC) at rest
- Use AES-256 encryption for PII data
- Secure key management via environment variables

### 4. Session Security
- JWT refresh token rotation
- Session invalidation on password change
- Concurrent session limits

### 5. API Security
- CORS optimization (allow only specific origins)
- Request size limits (1MB max)
- SQL injection prevention (Prisma parameterized queries)
- XSS protection (output encoding)

## 4. New Features

### 1. Notification System
```
┌─────────────────────────────────────────┐
│         Notification Architecture       │
├─────────────────────────────────────────┤
│  Event Trigger                          │
│  ├── Payment Success → SMS + Email      │
│  ├── Fee Overdue → SMS reminder         │
│  ├── KYC Approval → Email + In-app      │
│  └── Receipt Generated → Email          │
│                                         │
│  Channels                               │
│  ├── SMS (Twilio/MSG91)                │
│  ├── Email (Nodemailer/SendGrid)       │
│  └── In-app (WebSocket/Redis pub-sub)  │
│                                         │
│  Templates                              │
│  ├── Payment confirmation               │
│  ├── Overdue reminder                   │
│  ├── KYC status update                  │
│  └── Receipt delivery                   │
└─────────────────────────────────────────┘
```

### 2. Report Generation
- **PDF Reports**: Fee summaries, collection reports, defaulter lists
- **CSV Export**: Transaction history, fee assignments, audit logs
- **Scheduled Reports**: Daily/weekly/monthly automated reports
- **Custom Filters**: Date range, fee type, student class, payment method

### 3. Bulk Operations
- **Bulk Fee Assignment**: Assign fees to multiple students at once
- **Bulk Payment Processing**: Process multiple payments in batch
- **Bulk Import**: CSV import for students, fee structures
- **Bulk Notifications**: Send reminders to multiple defaulters

### 4. Mobile/PWA
- **Responsive Design**: Tailwind CSS mobile-first approach
- **PWA Manifest**: Installable on mobile devices
- **Offline Support**: Service worker for offline access
- **Touch Optimized**: Large buttons, swipe gestures

### 5. Enhanced Dashboards
- **Real-time Updates**: WebSocket for live data
- **Custom Widgets**: Draggable dashboard components
- **Advanced Charts**: More chart types (pie, bar, line, area)
- **Export Options**: Download charts as images/PDF

## 5. UI/UX Design System

### 1. Tailwind CSS Setup
```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#f0f9ff', 500: '#3b82f6', 900: '#1e3a8a' },
        secondary: { 500: '#8b5cf6' },
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
}
```

### 2. Component Library (shadcn/ui)
- **Buttons**: Primary, secondary, ghost, danger
- **Forms**: Input, select, checkbox, radio, textarea
- **Cards**: Glass panel, stat card, action card
- **Tables**: Sortable, paginated, responsive
- **Modals**: Dialog, drawer, toast notifications
- **Navigation**: Tabs, sidebar, breadcrumbs

### 3. Responsive Breakpoints
```css
/* Mobile-first approach */
sm: 640px    /* Mobile landscape */
md: 768px    /* Tablet */
lg: 1024px   /* Desktop */
xl: 1280px   /* Large desktop */
2xl: 1536px  /* Extra large */
```

### 4. Design Tokens
```javascript
// Consistent spacing, typography, colors
const tokens = {
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  fontSize: { xs: '12px', sm: '14px', base: '16px', lg: '18px', xl: '20px' },
  borderRadius: { sm: '4px', md: '8px', lg: '12px', full: '9999px' },
}
```

### 5. Animation System
- **Framer Motion**: Page transitions, modals, toasts
- **CSS Transitions**: Hover states, focus states
- **Loading States**: Skeleton loaders, spinners

## 6. Testing Strategy

### 1. Unit Tests (Jest)
- Business logic: 90%+ coverage
- Controllers: 80%+ coverage
- Overall: 75%+ coverage

### 2. Integration Tests (Supertest)
- API endpoint testing
- Database integration testing
- Authentication flow testing

### 3. E2E Tests (Playwright)
- User flow testing
- Cross-browser testing
- Mobile responsiveness testing

### 4. Test Organization
```
apps/api/tests/
├── unit/
│   ├── fee-calculator.test.js
│   ├── risk-scorer.test.js
│   └── receipt-generator.test.js
├── integration/
│   ├── auth.test.js
│   ├── payments.test.js
│   └── fees.test.js
└── e2e/
    ├── guardian-flow.test.js
    └── admin-flow.test.js
```

### 5. CI/CD Pipeline
- Run linting
- Run unit tests
- Run integration tests
- Run E2E tests
- Generate coverage report
- Deploy to staging (on main branch)

## 7. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- Set up Tailwind CSS
- Add input validation middleware
- Implement security headers
- Add database indexes
- Set up Redis caching
- Create testing infrastructure

### Phase 2: Core Improvements (Weeks 3-4)
- Refactor UI components to Tailwind
- Add notification service (SMS/Email)
- Implement bulk operations
- Add report generation
- Optimize database queries
- Add unit and integration tests

### Phase 3: Advanced Features (Weeks 5-6)
- Add PWA support
- Implement real-time updates
- Add advanced dashboard widgets
- Add scheduled reports
- Add E2E tests
- Performance optimization

### Phase 4: Polish & Deploy (Weeks 7-8)
- UI/UX refinements
- Security audit
- Load testing
- Documentation
- CI/CD setup
- Production deployment

### Milestone Deliverables
- Week 2: Security hardening complete
- Week 4: Core features working
- Week 6: Advanced features complete
- Week 8: Production ready

## 8. Success Metrics

### Performance
- API response time: < 200ms (95th percentile)
- Database query time: < 50ms (average)
- Page load time: < 2 seconds
- Lighthouse score: > 90

### Security
- Zero critical vulnerabilities
- 100% input validation coverage
- All sensitive data encrypted
- Regular security audits

### Quality
- Test coverage: > 75%
- Zero critical bugs in production
- 99.9% uptime
- Mean time to recovery: < 5 minutes

### User Experience
- Mobile responsiveness: 100%
- Accessibility: WCAG 2.1 AA
- User satisfaction: > 4.5/5
- Support tickets: < 1% of users

## 9. Risks & Mitigations

### Technical Risks
1. **Redis setup complexity**: Use managed Redis service
2. **Tailwind migration effort**: Incremental migration, component by component
3. **Test maintenance**: Automated test generation, CI/CD integration

### Business Risks
1. **Feature scope creep**: Strict phase adherence, MVP focus
2. **Timeline delays**: Buffer time built into phases, parallel workstreams
3. **User adoption**: Progressive rollout, training documentation

### Security Risks
1. **New vulnerabilities**: Regular security audits, penetration testing
2. **Data breaches**: Encryption at rest and in transit, access controls
3. **Compliance**: DPDP Act compliance, data privacy measures

## 10. Appendix

### A. Technology Stack
- **Frontend**: React 19, Vite, Tailwind CSS, Zustand, Framer Motion
- **Backend**: Node.js, Express, Prisma ORM, PostgreSQL
- **Infrastructure**: Redis, Docker, GitHub Actions
- **Testing**: Jest, Supertest, Playwright

### B. Database Schema Changes
- Add indexes for performance optimization
- Add notification preferences table
- Add report schedules table
- Add bulk operation logs table

### C. API Endpoints Added
- `POST /api/notifications/send` - Send notification
- `GET /api/notifications` - Get user notifications
- `POST /api/reports/generate` - Generate report
- `GET /api/reports/:id/download` - Download report
- `POST /api/bulk/assign` - Bulk fee assignment
- `POST /api/bulk/payments` - Bulk payment processing

### D. Environment Variables Added
```env
# Redis
REDIS_URL=redis://localhost:6379

# Notifications
SMS_PROVIDER=twilio
SMS_API_KEY=your_api_key
EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=your_api_key

# Security
JWT_REFRESH_SECRET=your_refresh_secret
ENCRYPTION_KEY=your_encryption_key

# Storage
STORAGE_PROVIDER=local
STORAGE_PATH=./uploads
```
