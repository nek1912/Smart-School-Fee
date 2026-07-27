const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

dotenv.config();

const { requestId, securityHeaders, corsOptions } = require('./middlewares/security');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');
const { authenticate, checkRole } = require('./middlewares/rbac');
const { auditLogger } = require('./middlewares/audit');
const { validateBody } = require('./middlewares/validate');
const paymentSchemas = require('./schemas/paymentSchemas');
const feeSchemas = require('./schemas/feeSchemas');
const authController = require('./controllers/auth');
const feeController = require('./controllers/fee');
const kycController = require('./controllers/kyc');
const paymentsController = require('./controllers/payments');
const chequesController = require('./controllers/cheques');
const reconController = require('./controllers/reconciliation');
const waiversController = require('./controllers/waivers');
const refundsController = require('./controllers/refunds');
const expensesController = require('./controllers/expenses');
const dashboardController = require('./controllers/dashboard');

const app = express();
const config = require('./config/env').requireConfig();
const PORT = config.port;

app.use(requestId);
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.nodeEnv !== 'production',
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Smart School FinTech API is running' });
});

// Authentication Routes
app.post('/api/auth/signup', authRateLimiter, authController.signup);
app.post('/api/auth/login', authRateLimiter, authController.login);
app.post('/api/auth/verify-otp', authRateLimiter, authController.verifyOTP);
app.post('/api/auth/forgot-password', authRateLimiter, authController.forgotPassword);
app.post('/api/auth/reset-password', authRateLimiter, authController.resetPassword);

// DPDP Consent Endpoint (Requires guardian authentication)
app.post(
  '/api/auth/consent',
  authenticate,
  checkRole(['guardian', 'admin']),
  auditLogger('student', 'submit_dpdp_consent'),
  authController.submitConsent
);

app.get(
  '/api/guardians/students',
  authenticate,
  checkRole(['guardian', 'admin']),
  authController.getMyStudents
);

// Protected Admin Testing Route (RBAC verification)
app.get(
  '/api/admin/dashboard',
  authenticate,
  checkRole(['admin']),
  (req, res) => {
    res.json({ message: 'Welcome to Admin Dashboard', adminId: req.user.id });
  }
);

// Admin-only staff creation route
app.post(
  '/api/admin/staff',
  authenticate,
  checkRole(['admin']),
  authController.createStaff
);

// Protected Admin Route to fetch Cashiers list
app.get(
  '/api/admin/cashiers',
  authenticate,
  checkRole(['admin']),
  authController.getCashiers
);

// Protected Admin Route to fetch Audit Logs list
app.get(
  '/api/admin/audit-logs',
  authenticate,
  checkRole(['admin']),
  authController.getAuditLogs
);

// === FEE ENGINE ROUTES ===
app.get(
  '/api/academic-years',
  authenticate,
  checkRole(['admin', 'cashier', 'guardian']),
  feeController.getAcademicYears
);
app.get(
  '/api/fees/structures',
  authenticate,
  checkRole(['admin', 'cashier', 'guardian']),
  feeController.getFeeStructures
);
app.post(
  '/api/fees/structures',
  authenticate,
  checkRole(['admin']),
  validateBody(feeSchemas.createFeeStructureSchema),
  auditLogger('fee_structure', 'create_fee_structure'),
  feeController.createFeeStructure
);
app.put(
  '/api/fees/structures/:id',
  authenticate,
  checkRole(['admin']),
  auditLogger('fee_structure', 'update_fee_structure'),
  feeController.updateFeeStructure
);
app.post(
  '/api/fees/assignments',
  authenticate,
  checkRole(['admin', 'cashier']),
  validateBody(feeSchemas.assignFeeSchema),
  auditLogger('fee_assignment', 'assign_fee'),
  feeController.assignFee
);
app.get(
  '/api/fees/assignments',
  authenticate,
  checkRole(['admin', 'cashier', 'guardian']),
  feeController.getFeeAssignments
);

// === KYC & IDENTITY ROUTES ===
app.post(
  '/api/students/kyc',
  authenticate,
  checkRole(['guardian', 'admin']),
  auditLogger('student_kyc', 'submit_kyc'),
  kycController.submitKYC
);
app.get(
  '/api/admin/students',
  authenticate,
  checkRole(['admin', 'cashier']),
  kycController.getAllStudents
);
app.get(
  '/api/admin/approvals',
  authenticate,
  checkRole(['admin']),
  kycController.getPendingApprovals
);
app.post(
  '/api/admin/approvals/:studentId/verify',
  authenticate,
  checkRole(['admin']),
  auditLogger('student', 'approve_kyc'),
  kycController.approveKYC
);
app.post(
  '/api/admin/approvals/:studentId/override',
  authenticate,
  checkRole(['admin']),
  auditLogger('student', 'override_kyc'),
  kycController.overrideKYC
);

// === PAYMENTS & TRANSACTIONS ROUTES ===
app.post(
  '/api/payments/initiate',
  authenticate,
  checkRole(['guardian']),
  validateBody(paymentSchemas.initiatePaymentSchema),
  paymentsController.initiatePayment
);
app.post(
  '/api/payments/webhook',
  paymentsController.handleWebhook
);
app.get(
  '/api/payments/verify',
  authenticate,
  checkRole(['guardian', 'admin', 'cashier']),
  paymentsController.verifyPayment
);
app.get(
  '/api/payments/receipt',
  authenticate,
  checkRole(['guardian', 'admin', 'cashier']),
  paymentsController.getReceipt
);
app.get(
  '/api/payments/transactions',
  authenticate,
  checkRole(['guardian', 'admin', 'cashier']),
  paymentsController.getTransactions
);
app.post(
  '/api/payments/collect-manual',
  authenticate,
  checkRole(['admin', 'cashier']),
  validateBody(paymentSchemas.collectManualSchema),
  paymentsController.collectManual
);

// === OFFLINE COLLECTION & RECONCILIATION ROUTES ===
app.post(
  '/api/payments/offline',
  authenticate,
  checkRole(['admin', 'cashier']),
  validateBody(paymentSchemas.collectOfflineSchema),
  paymentsController.collectOffline
);
app.post(
  '/api/payments/offline/sync',
  authenticate,
  checkRole(['admin', 'cashier']),
  paymentsController.syncOffline
);
app.put(
  '/api/payments/:id/deposit',
  authenticate,
  checkRole(['admin', 'cashier']),
  paymentsController.depositCash
);
app.get(
  '/api/cheques',
  authenticate,
  checkRole(['admin', 'cashier']),
  chequesController.getCheques
);
app.put(
  '/api/cheques/:id/deposit',
  authenticate,
  checkRole(['admin', 'cashier']),
  chequesController.depositCheque
);
app.put(
  '/api/cheques/:id/bounce',
  authenticate,
  checkRole(['admin', 'cashier']),
  chequesController.bounceCheque
);
app.put(
  '/api/cheques/:id/clear',
  authenticate,
  checkRole(['admin', 'cashier']),
  chequesController.clearCheque
);
app.post(
  '/api/reconciliation/upload',
  authenticate,
  checkRole(['admin', 'cashier']),
  reconController.uploadStatement
);

// === WAIVER & PENALTY ROUTES ===
app.post(
  '/api/waivers',
  authenticate,
  checkRole(['admin', 'cashier']),
  waiversController.createWaiverPenalty
);
app.put(
  '/api/waivers/:id/approve',
  authenticate,
  checkRole(['admin']),
  waiversController.approveWaiverPenalty
);
app.put(
  '/api/waivers/:id/reject',
  authenticate,
  checkRole(['admin']),
  waiversController.rejectWaiverPenalty
);
app.get(
  '/api/waivers',
  authenticate,
  checkRole(['admin', 'cashier']),
  waiversController.getWaiversPenalties
);

// === REFUND & STAGE 2 KYC ROUTES ===
app.post(
  '/api/refunds',
  authenticate,
  checkRole(['admin']),
  refundsController.initiateRefund
);
app.post(
  '/api/students/kyc/stage2',
  authenticate,
  checkRole(['guardian', 'admin']),
  kycController.submitStage2KYC
);

// === MAINTENANCE EXPENSES ROUTES ===
app.post(
  '/api/expenses',
  authenticate,
  checkRole(['admin']),
  expensesController.createExpense
);
app.get(
  '/api/expenses',
  authenticate,
  checkRole(['admin']),
  expensesController.getExpenses
);

// === DASHBOARD WIRING ROUTES ===
app.get(
  '/api/dashboard/metrics',
  authenticate,
  checkRole(['admin']),
  dashboardController.getMetrics
);
app.get(
  '/api/dashboard/revenue-breakdown',
  authenticate,
  checkRole(['admin']),
  dashboardController.getRevenueBreakdown
);
app.get(
  '/api/dashboard/defaulters',
  authenticate,
  checkRole(['admin']),
  dashboardController.getDefaulters
);
app.get(
  '/api/dashboard/reports',
  authenticate,
  checkRole(['admin']),
  dashboardController.getReports
);

// Protected Cashier Testing Route (RBAC verification)
app.get(
  '/api/cashier/dashboard',
  authenticate,
  checkRole(['cashier', 'admin']),
  (req, res) => {
    res.json({ message: 'Welcome to Cashier Dashboard', cashierId: req.user.id });
  }
);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
