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