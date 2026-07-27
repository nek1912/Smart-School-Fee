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