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

const archiveFailedTransactions = async (tx, feeAssignmentId, actorId = null) => {
  const failed = await tx.transaction.findMany({
    where: { feeAssignmentId, status: { in: ['failed', 'reversed'] } }
  });
  for (const txn of failed) {
    await tx.auditLog.create({
      data: {
        actorId,
        actorRole: 'system',
        action: 'archive_failed_transaction',
        entity: 'transaction',
        entityId: txn.id,
        before: { id: txn.id, status: txn.status, method: txn.method },
        after: { id: txn.id, status: txn.status, archived: true, note: 'Archived before new payment attempt' }
      }
    });
  }
  return failed.length;
};

const assertNoPendingTransaction = async (tx, feeAssignmentId, newMethod = null) => {
  const pending = await tx.transaction.findFirst({
    where: {
      feeAssignmentId,
      status: { in: ['pending', 'success'] }
    },
    include: { chequeRecords: true }
  });
  if (!pending) return;

  if (pending.status === 'success') {
    throw Object.assign(new Error('This fee component has already been paid'), { statusCode: 400 });
  }

  const isStale = new Date(pending.createdAt) < new Date(Date.now() - 30 * 60 * 1000);

  // CASH payments always override any pending transaction (cash is immediate & irrevocable)
  if (newMethod === 'CASH') {
    await tx.transaction.update({
      where: { id: pending.id },
      data: { status: 'failed' }
    });
    if (pending.method === 'CHEQUE') {
      await tx.chequeRecord.updateMany({
        where: { transactionId: pending.id },
        data: { depositStatus: 'cancelled' }
      });
    }
    return;
  }

  // Auto-cancel stale pending transactions (>30 min old)
  if (isStale) {
    await tx.transaction.update({
      where: { id: pending.id },
      data: { status: 'failed' }
    });
    if (pending.method === 'CHEQUE') {
      await tx.chequeRecord.updateMany({
        where: { transactionId: pending.id },
        data: { depositStatus: 'cancelled' }
      });
    }
    return;
  }

  throw Object.assign(new Error('A payment is already being processed for this fee component'), { statusCode: 400 });
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
    await archiveFailedTransactions(tx, assignment.id, actorId);
    await assertNoPendingTransaction(tx, assignment.id, 'CASH');
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
  }, { isolationLevel: 'Serializable' });
};

const collectCheque = async ({ feeAssignmentId, amount, chequeNo, bank, idempotencyKey, actorId, actorRole }) => {
  if (!chequeNo || !bank) throw Object.assign(new Error('chequeNo and bank are required for cheque payments'), { statusCode: 400 });
  const existing = await prisma.transaction.findUnique({ where: { idempotencyKey }, include: { chequeRecords: true } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const assignment = await loadAssignment(tx, feeAssignmentId);
    assertAssignmentPayable(assignment);
    await archiveFailedTransactions(tx, assignment.id, actorId);
    await assertNoPendingTransaction(tx, assignment.id, 'CHEQUE');
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
  }, { isolationLevel: 'Serializable' });
};

const markUpiSuccess = async ({ orderId, gatewayTxnId, actorId = null }) => {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findFirst({
      where: { gatewayRef: orderId },
      include: { student: { include: { guardian: true } }, feeAssignment: { include: { feeStructure: true } } }
    });
    if (!transaction) throw Object.assign(new Error('Transaction reference not found'), { statusCode: 404 });
    if (transaction.status === 'success') return transaction;

    const existingReceipt = await tx.receipt.findUnique({
      where: { transactionId: transaction.id }
    });
    if (existingReceipt) {
      return { ...transaction, receiptNumber: existingReceipt.receiptNumber };
    }

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

module.exports = {
  assertAssignmentPayable,
  assertNoPendingTransaction,
  collectCash,
  collectCheque,
  markUpiSuccess,
  markUpiFailed
};