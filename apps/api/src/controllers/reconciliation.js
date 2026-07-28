const prisma = require('../config/db');
const { parseStatementCsv, matchStatementRows } = require('../domain/reconciliation/matcher');
const { logAudit } = require('../middlewares/audit');
const { ValidationError, NotFoundError } = require('../errors/AppError');

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
    const results = matchStatementRows({ rows, transactions: dbTransactions });

    const batch = await prisma.$transaction(async (tx) => {
      const totalRows = results.length;
      const autoMatched = results.filter(r => r.category === 'auto_matched').length;
      const needsReview = results.filter(r => r.category === 'needs_review').length;
      const unmatchedCount = results.filter(r => r.category === 'unmatched').length;

      const createdBatch = await tx.reconciliationBatch.create({
        data: {
          uploadedById: req.user.id,
          fileName: req.body.fileName || null,
          status: 'processed',
          totalRows,
          autoMatched,
          needsReview,
          unmatchedCount
        }
      });

      for (const result of results) {
        const matchExplanation = result.transaction
          ? `Matched with ${result.transaction.receiptNumber || 'transaction'} (score: ${result.score})`
          : null;

        await tx.reconciliationItem.create({
          data: {
            batchId: createdBatch.id,
            transactionId: result.transaction ? result.transaction.id : null,
            amount: result.row.amount,
            statementDate: result.row.statementDate,
            reference: result.row.reference || null,
            bankDescription: result.row.description || null,
            status: result.category,
            confidence: result.score,
            matchExplanation
          }
        });
      }

      return createdBatch;
    });

    return res.status(200).json({
      success: true,
      batchId: batch.id,
      summary: {
        totalRows: batch.totalRows,
        autoMatched: batch.autoMatched,
        needsReview: batch.needsReview,
        unmatchedCount: batch.unmatchedCount
      }
    });

  } catch (err) {
    next(err);
  }
};

const getBatch = async (req, res, next) => {
  try {
    const { id } = req.params;

    const batch = await prisma.reconciliationBatch.findUnique({
      where: { id: Number(id) },
      include: { items: true }
    });

    if (!batch) {
      throw new NotFoundError('ReconciliationBatch');
    }

    return res.status(200).json({ success: true, data: batch });

  } catch (err) {
    next(err);
  }
};

const resolveItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, transactionId } = req.body;

    if (!action || !['approve', 'reject', 'override'].includes(action)) {
      throw new ValidationError('action must be one of: approve, reject, override');
    }

    if (action === 'override' && !transactionId) {
      throw new ValidationError('transactionId is required for override action');
    }

    const item = await prisma.reconciliationItem.findUnique({ where: { id: Number(id) } });
    if (!item) {
      throw new NotFoundError('ReconciliationItem');
    }

    const result = await prisma.$transaction(async (tx) => {
      const updateData = {
        resolvedById: req.user.id,
        resolvedAt: new Date()
      };

      if (action === 'approve') {
        updateData.status = 'matched';
      } else if (action === 'reject') {
        updateData.status = 'rejected';
      } else if (action === 'override') {
        updateData.status = 'matched';
        updateData.transactionId = Number(transactionId);
      }

      const updated = await tx.reconciliationItem.update({
        where: { id: Number(id) },
        data: updateData
      });

      await logAudit({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'reconcile_resolve',
        entity: 'reconciliation_item',
        entityId: Number(id),
        before: { status: item.status, transactionId: item.transactionId },
        after: { status: updateData.status, transactionId: updateData.transactionId || null },
        tx
      });

      return updated;
    });

    return res.status(200).json({ success: true, data: result });

  } catch (err) {
    next(err);
  }
};

const bulkAction = async (req, res, next) => {
  try {
    const { itemIds, action } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      throw new ValidationError('itemIds must be a non-empty array');
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      throw new ValidationError('action must be one of: approve, reject');
    }

    const items = await prisma.reconciliationItem.findMany({
      where: { id: { in: itemIds } }
    });

    if (items.length !== itemIds.length) {
      throw new NotFoundError('One or more ReconciliationItems');
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedItems = [];

      for (const item of items) {
        const updateData = {
          status: action === 'approve' ? 'matched' : 'rejected',
          resolvedById: req.user.id,
          resolvedAt: new Date()
        };

        const updated = await tx.reconciliationItem.update({
          where: { id: item.id },
          data: updateData
        });

        await logAudit({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'reconcile_resolve',
          entity: 'reconciliation_item',
          entityId: item.id,
          before: { status: item.status, transactionId: item.transactionId },
          after: { status: updateData.status, transactionId: updateData.transactionId || null },
          tx
        });

        updatedItems.push(updated);
      }

      return updatedItems;
    });

    return res.status(200).json({ success: true, data: result });

  } catch (err) {
    next(err);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const batches = await prisma.reconciliationBatch.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        totalRows: true,
        autoMatched: true,
        needsReview: true,
        unmatchedCount: true,
        status: true,
        createdAt: true,
        uploadedById: true
      }
    });

    return res.status(200).json({ success: true, data: batches });

  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadStatement,
  getBatch,
  resolveItem,
  bulkAction,
  getHistory
};
