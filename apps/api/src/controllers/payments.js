const axios = require('axios');
const prisma = require('../config/db');
const { logAudit } = require('../middlewares/audit');
const { CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_BASE_URL, verifySignature } = require('../config/cashfree');
const { generateReceiptBase64 } = require('../utils/receipts');
const { collectCash, collectCheque, markUpiSuccess, markUpiFailed } = require('../domain/payments/paymentService');
const { requireConfig } = require('../config/env');
const { syncOfflinePayments } = require('../domain/payments/offlineSyncService');
const { ValidationError, NotFoundError, AppError } = require('../errors/AppError');

const canAutoPromoteMockPayment = (nodeEnv) => nodeEnv !== 'production';

const adjustedAmount = (assignment) => {
  const base = Number(assignment.feeStructure.amount);
  return (assignment.waiverPenalties || []).reduce((total, item) => {
    if (item.status !== 'approved') return total;
    return item.type === 'penalty' ? total + Number(item.amount) : total - Number(item.amount);
  }, base);
};

const resolvePendingTransaction = async (assignmentId) => {
  const pendingTx = await prisma.transaction.findFirst({
    where: {
      feeAssignmentId: assignmentId,
      status: { in: ['pending', 'success'] }
    },
    include: { chequeRecords: true }
  });
  if (!pendingTx) return null;

  if (pendingTx.status === 'success') {
    throw new ValidationError('This fee component has already been paid');
  }

  const isCheque = pendingTx.method === 'CHEQUE';
  const hasCheque = pendingTx.chequeRecords?.[0];
  const hasDepositPending = hasCheque && ['deposit_pending', 'bank_pending'].includes(hasCheque.depositStatus);
  const hasLongOverdue = new Date(pendingTx.createdAt) < new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h old

  if (isCheque && hasLongOverdue) {
    await prisma.transaction.update({
      where: { id: pendingTx.id },
      data: { status: 'failed' }
    });
    await prisma.chequeRecord.updateMany({
      where: { transactionId: pendingTx.id },
      data: { depositStatus: 'cancelled' }
    });
    return null;
  }

  if (isCheque && hasDepositPending && hasLongOverdue) {
    await prisma.transaction.update({
      where: { id: pendingTx.id },
      data: { status: 'failed' }
    });
    await prisma.chequeRecord.updateMany({
      where: { transactionId: pendingTx.id },
      data: { depositStatus: 'cancelled' }
    });
    return null;
  }

  throw new ValidationError('A payment is already being processed for this fee component');
};

const initiatePayment = async (req, res, next) => {
  try {
    const { feeAssignmentId, method, idempotencyKey } = req.body;
    const guardianId = req.user.id;

    if (!feeAssignmentId || !method || !idempotencyKey) {
      throw new ValidationError('feeAssignmentId, method and idempotencyKey are required');
    }

    if (method !== 'UPI') {
      throw new ValidationError('Checkout initiation only supports UPI');
    }

    const existingTx = await prisma.transaction.findUnique({
      where: { idempotencyKey }
    });
    if (existingTx) {
      throw new ValidationError('Duplicate payment request detected');
    }

    const assignment = await prisma.feeAssignment.findUnique({
      where: { id: Number(feeAssignmentId) },
      include: {
        student: {
          include: { guardian: true }
        },
        feeStructure: true,
        waiverPenalties: true
      }
    });

    if (!assignment) {
      throw new NotFoundError('Fee assignment');
    }

    if (assignment.status === 'paid') {
      throw new ValidationError('This fee component is already fully paid');
    }

    await resolvePendingTransaction(assignment.id);

    if (assignment.student.guardianId !== guardianId) {
      throw new AppError('Unauthorized ward lookup', 403);
    }

    const orderId = `ORD_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
    const amount = adjustedAmount(assignment);

    const transaction = await prisma.transaction.create({
      data: {
        studentId: assignment.studentId,
        feeAssignmentId: assignment.id,
        amount: amount,
        method: 'UPI',
        status: 'pending',
        gatewayRef: orderId,
        idempotencyKey
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    try {
      const orderPayload = {
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: `CUST_${assignment.student.guardian.id}`,
          customer_phone: assignment.student.guardian.mobile,
          customer_email: assignment.student.guardian.email
        },
        order_meta: {
          return_url: `${frontendUrl}/payment/success?order_id=${orderId}`
        }
      };

      const orderResponse = await axios.post(
        `${CASHFREE_BASE_URL}/orders`,
        orderPayload,
        {
          headers: {
            'x-api-version': '2022-09-01',
            'x-client-id': process.env.CASHFREE_CLIENT_ID || CASHFREE_CLIENT_ID,
            'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || CASHFREE_CLIENT_SECRET,
            'Content-Type': 'application/json'
          }
        }
      );

      const paymentLink = orderResponse.data.payment_link;
      if (!paymentLink) {
        throw new Error('Cashfree sandbox failed to return a valid payment_link');
      }

      await logAudit({
        actorId: guardianId,
        actorRole: req.user.role,
        action: 'initiate_payment',
        entity: 'transaction',
        entityId: transaction.id,
        before: null,
        after: { transactionId: transaction.id, orderId, method: 'UPI' }
      });

      return res.status(200).json({
        success: true,
        orderId,
        paymentUrl: paymentLink
      });

    } catch (apiErr) {
      console.warn('⚠️ Cashfree Sandbox gateway error (falling back to local mock simulator):', apiErr.response?.data || apiErr.message);

      const mockPaymentUrl = `${frontendUrl}/payment/success?order_id=${orderId}`;

      await logAudit({
        actorId: guardianId,
        actorRole: req.user.role,
        action: 'initiate_payment_mock',
        entity: 'transaction',
        entityId: transaction.id,
        before: null,
        after: { transactionId: transaction.id, orderId, method: 'UPI', mock: true }
      });

      return res.status(200).json({
        success: true,
        orderId,
        paymentUrl: mockPaymentUrl
      });
    }

  } catch (err) {
    next(err);
  }
};

const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    const rawBody = JSON.stringify(req.body);

    const isVerified = verifySignature(signature, rawBody, timestamp);

    const isTestBypass = process.env.NODE_ENV !== 'production' && req.headers['x-test-bypass'] === 'true';

    if (!isVerified && !isTestBypass) {
      console.warn('⚠️ Rejected unauthorized Webhook signature attempt.');
      throw new AppError('Invalid webhook signature', 401);
    }

    const data = req.body.data || req.body;
    const orderId = data.order?.order_id || req.body.order_id || data.order_id;
    const orderStatus = data.order?.order_status || data.payment?.payment_status || req.body.order_status || req.body.payment_status || 'PAID';
    const gatewayTxnId = data.payment?.cf_payment_id || req.body.txn_id || req.body.cf_payment_id || `TXN_${Date.now()}`;

    if (!orderId) {
      throw new ValidationError('Missing order_id reference');
    }

    const transaction = await prisma.transaction.findFirst({
      where: { gatewayRef: orderId },
      include: {
        student: {
          include: { guardian: true }
        },
        feeAssignment: {
          include: { feeStructure: true }
        }
      }
    });

    if (!transaction) {
      throw new NotFoundError('Transaction reference');
    }

    if (transaction.status === 'success') {
      return res.status(200).json({ status: 'already_processed' });
    }

    if (orderStatus === 'PAID' || orderStatus === 'SUCCESS' || orderStatus === 'SUCCESSFUL') {
      await markUpiSuccess({ orderId, gatewayTxnId });
      return res.status(200).json({ status: 'success' });
    }
    await markUpiFailed({ orderId, reason: orderStatus });
    return res.status(200).json({ status: 'failed' });

  } catch (err) {
    next(err);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const { order_id } = req.query;

    if (!order_id) {
      throw new ValidationError('order_id is required');
    }

    let tx = await prisma.transaction.findFirst({
      where: { gatewayRef: order_id },
      include: {
        student: {
          include: { guardian: true }
        },
        feeAssignment: {
          include: { feeStructure: true }
        }
      }
    });

    if (!tx) {
      throw new NotFoundError('Transaction');
    }

    if (tx.status === 'pending' && canAutoPromoteMockPayment(requireConfig().nodeEnv)) {
      tx = await markUpiSuccess({ orderId: order_id, gatewayTxnId: `MOCK_${Date.now()}`, actorId: tx.student.guardianId });
    }

    return res.status(200).json({
      status: tx.status,
      transactionId: tx.id,
      receiptNumber: tx.receiptNumber
    });
  } catch (err) {
    next(err);
  }
};

const getReceipt = async (req, res, next) => {
  try {
    const { transaction_id } = req.query;

    if (!transaction_id) {
      throw new ValidationError('transaction_id is required');
    }

    const receipt = await prisma.receipt.findUnique({
      where: { transactionId: Number(transaction_id) },
      include: { transaction: { include: { student: true } } }
    });
    if (!receipt) throw new NotFoundError('Receipt');
    if (req.user.role === 'guardian' && receipt.transaction.student.guardianId !== req.user.id) {
      throw new AppError('Forbidden: Access denied', 403);
    }

    return res.status(200).json({
      receiptUrl: receipt.fileUrl
    });
  } catch (err) {
    next(err);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const role = req.user.role;
    let transactions = [];

    if (role === 'admin' || role === 'cashier') {
      transactions = await prisma.transaction.findMany({
        include: {
          student: true,
          feeAssignment: { include: { feeStructure: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      transactions = await prisma.transaction.findMany({
        where: {
          student: { guardianId: req.user.id }
        },
        include: {
          student: true,
          feeAssignment: { include: { feeStructure: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    return res.status(200).json(transactions);
  } catch (err) {
    next(err);
  }
};

const collectManual = async (req, res, next) => {
  try {
    const { feeAssignmentId, method, chequeNo, bank, deposited, amount: requestedAmount } = req.body;
    const cashierId = req.user.id;

    if (!feeAssignmentId || !method) {
      throw new ValidationError('feeAssignmentId and method are required');
    }

    if (method !== 'CASH' && method !== 'CHEQUE') {
      throw new ValidationError('Manual collection only supports CASH or CHEQUE');
    }

    if (method === 'CHEQUE' && (!chequeNo || !bank)) {
      throw new ValidationError('chequeNo and bank are required for cheque payments');
    }

    const assignment = await prisma.feeAssignment.findUnique({
      where: { id: Number(feeAssignmentId) },
      include: {
        student: { include: { guardian: true } },
        feeStructure: true,
        waiverPenalties: true
      }
    });

    if (!assignment) {
      throw new NotFoundError('Fee assignment');
    }

    if (assignment.status === 'paid') {
      throw new ValidationError('Fee component is already paid');
    }

    await resolvePendingTransaction(assignment.id);

    const amount = requestedAmount || adjustedAmount(assignment);
    const idempotencyKey = req.body.idempotencyKey || `MAN_${feeAssignmentId}_${method}_${Date.now()}`;
    const transaction = method === 'CASH'
      ? await collectCash({ feeAssignmentId, amount, idempotencyKey, actorId: req.user.id, actorRole: req.user.role, deposited })
      : await collectCheque({ feeAssignmentId, amount, chequeNo, bank, idempotencyKey, actorId: req.user.id, actorRole: req.user.role });

    return res.status(201).json({ success: true, message: `${method} payment logged successfully`, transaction });

  } catch (err) {
    next(err);
  }
};

const collectOffline = async (req, res, next) => {
  try {
    const { student_id, fee_assignment_id, amount, method, cheque_no, bank, idempotency_key } = req.body;
    const actorId = req.user.id;

    if (!fee_assignment_id || !method || !idempotency_key) {
      throw new ValidationError('Fee assignment not found. Please assign the fee to the student before collecting payment.');
    }

    if (method !== 'CASH' && method !== 'CHEQUE') {
      throw new ValidationError('Offline collection only supports CASH or CHEQUE');
    }

    // Auto-cancel any stale pending transactions before processing new payment
    await resolvePendingTransaction(Number(fee_assignment_id));

    const existingTx = await prisma.transaction.findUnique({
      where: { idempotencyKey: idempotency_key },
      include: { chequeRecords: true }
    });

    if (existingTx) {
      return res.status(200).json(existingTx);
    }

    const transaction = method === 'CASH'
      ? await collectCash({ feeAssignmentId: fee_assignment_id, amount, idempotencyKey: idempotency_key, actorId, actorRole: req.user.role, deposited: false })
      : await collectCheque({ feeAssignmentId: fee_assignment_id, amount, chequeNo: cheque_no, bank, idempotencyKey: idempotency_key, actorId, actorRole: req.user.role });
    return res.status(201).json(transaction);

  } catch (err) {
    next(err);
  }
};

const syncOffline = async (req, res, next) => {
  try {
    const { payments } = req.body;
    const result = await syncOfflinePayments({
      payments,
      actorId: req.user.id,
      actorRole: req.user.role
    });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const depositCash = async (req, res, next) => {
  try {
    const { id } = req.params;
    const transaction = await prisma.transaction.update({
      where: { id: Number(id) },
      data: { depositedAt: new Date() }
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'deposit_cash',
        entity: 'transaction',
        entityId: transaction.id,
        before: { id: transaction.id, depositedAt: null },
        after: { id: transaction.id, depositedAt: transaction.depositedAt }
      }
    });

    return res.status(200).json(transaction);
  } catch (err) {
    next(err);
  }
};

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
