const prisma = require('../../config/db');
const { collectCash, collectCheque } = require('./paymentService');

const syncOfflinePayments = async ({ payments, actorId, actorRole }) => {
  if (!Array.isArray(payments) || payments.length === 0) return { results: [] };
  const results = [];

  for (const payment of payments) {
    try {
      const localId = payment.local_id || payment.idempotency_key;

      const existingTx = await prisma.transaction.findUnique({
        where: { idempotencyKey: payment.idempotency_key }
      });
      if (existingTx) {
        results.push({
          localId,
          status: 'already_synced',
          transactionId: existingTx.id,
          receiptNumber: existingTx.receiptNumber || null
        });
        continue;
      }

      const feeAssignment = await prisma.feeAssignment.findUnique({
        where: { id: Number(payment.fee_assignment_id) },
        select: { studentId: true, status: true }
      });

      if (!feeAssignment) {
        results.push({
          localId,
          status: 'failed',
          error: 'Fee assignment not found'
        });
        continue;
      }

      if (feeAssignment.status === 'paid') {
        results.push({
          localId,
          status: 'already_paid',
          reason: 'Fee component has already been marked as paid'
        });
        continue;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const duplicateTx = await prisma.transaction.findFirst({
        where: {
          studentId: feeAssignment.studentId,
          amount: Number(payment.amount),
          createdAt: { gte: todayStart, lte: todayEnd },
          status: { in: ['success', 'pending'] }
        }
      });

      if (duplicateTx) {
        results.push({
          localId,
          status: 'conflict',
          candidateTransactionId: duplicateTx.id,
          reason: `A ${duplicateTx.method} payment of \u20B9${Number(payment.amount).toLocaleString('en-IN')} already exists today for this student`,
          actions: ['keep_both', 'skip']
        });
        continue;
      }

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
        localId,
        status: 'synced',
        transactionId: transaction.id,
        receiptNumber: transaction.receiptNumber || null
      });

    } catch (err) {
      results.push({
        localId: payment.local_id || payment.idempotency_key,
        status: 'failed',
        error: err.message
      });
    }
  }

  return { results };
};

module.exports = {
  syncOfflinePayments
};
