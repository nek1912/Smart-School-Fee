const prisma = require('../config/db');
const { parseStatementCsv, matchStatementRows } = require('../domain/reconciliation/matcher');
const { ValidationError } = require('../errors/AppError');

const isSameDay = (d1, d2) => {
  return d1.getUTCFullYear() === d2.getUTCFullYear() &&
         d1.getUTCMonth() === d2.getUTCMonth() &&
         d1.getUTCDate() === d2.getUTCDate();
};

const uploadStatement = async (req, res, next) => {
  try {
    const { csvText } = req.body;

    if (!csvText) {
      throw new ValidationError('csvText body parameter is required');
    }

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

  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadStatement
};
