const prisma = require('../config/db');
const { generateReceiptBase64 } = require('../utils/receipts');
const { NotFoundError, ValidationError } = require('../errors/AppError');

const getCheques = async (req, res, next) => {
  try {
    const cheques = await prisma.chequeRecord.findMany({
      include: {
        transaction: {
          include: {
            student: { include: { guardian: true } },
            feeAssignment: { include: { feeStructure: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json(cheques);
  } catch (err) {
    next(err);
  }
};

const depositCheque = async (req, res, next) => {
  try {
    const { id } = req.params;

    const cheque = await prisma.chequeRecord.findUnique({
      where: { id: Number(id) }
    });

    if (!cheque) {
      throw new NotFoundError('Cheque record');
    }

    const updatedCheque = await prisma.chequeRecord.update({
      where: { id: cheque.id },
      data: { depositStatus: 'bank_pending' }
    });

    await prisma.transaction.update({
      where: { id: cheque.transactionId },
      data: { depositedAt: new Date() }
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'deposit_cheque',
        entity: 'cheque_record',
        entityId: cheque.id,
        before: { id: cheque.id, depositStatus: cheque.depositStatus },
        after: { id: cheque.id, depositStatus: 'bank_pending' }
      }
    });

    return res.status(200).json(updatedCheque);
  } catch (err) {
    next(err);
  }
};

const bounceCheque = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { bounce_reason } = req.body;

    const cheque = await prisma.chequeRecord.findUnique({
      where: { id: Number(id) },
      include: {
        transaction: {
          include: {
            student: { include: { guardian: true } },
            feeAssignment: { include: { feeStructure: true } }
          }
        }
      }
    });

    if (!cheque) {
      throw new NotFoundError('Cheque record');
    }

    let penaltyRecord;

    await prisma.$transaction(async (tx) => {
      await tx.chequeRecord.update({
        where: { id: cheque.id },
        data: {
          depositStatus: 'bounced',
          bounceReason: bounce_reason || 'Insufficient funds'
        }
      });

      await tx.feeAssignment.update({
        where: { id: cheque.transaction.feeAssignmentId },
        data: { status: 'pending' }
      });

      await tx.transaction.update({
        where: { id: cheque.transactionId },
        data: { status: 'failed' }
      });

      penaltyRecord = await tx.waiverPenalty.create({
        data: {
          studentId: cheque.transaction.studentId,
          feeAssignmentId: cheque.transaction.feeAssignmentId,
          amount: 500.00,
          type: 'penalty',
          reason: `Cheque bounce: ${bounce_reason || 'Insufficient funds'}`,
          approvedById: req.user.id,
          approvedAt: new Date()
        }
      });

      console.log(`\n--- [SMS/EMAIL NOTIFICATION] ---\nTo: ${cheque.transaction.student.guardian.mobile} / ${cheque.transaction.student.guardian.email}\nDear ${cheque.transaction.student.guardian.name},\nYour cheque for ₹${Number(cheque.transaction.amount).toFixed(2)} has bounced. The linked fee assignment has been reopened, and a cheque bounce penalty of ₹500.00 has been applied.\n---------------------------------\n`);

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'bounce_cheque',
          entity: 'cheque_record',
          entityId: cheque.id,
          before: { id: cheque.id, depositStatus: cheque.depositStatus },
          after: { id: cheque.id, depositStatus: 'bounced', penaltyId: penaltyRecord.id }
        }
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Cheque bounce processed successfully',
      cheque: { ...cheque, depositStatus: 'bounced', bounceReason: bounce_reason },
      penalty: penaltyRecord
    });

  } catch (err) {
    next(err);
  }
};

const clearCheque = async (req, res, next) => {
  try {
    const { id } = req.params;

    const cheque = await prisma.chequeRecord.findUnique({
      where: { id: Number(id) },
      include: {
        transaction: {
          include: {
            student: { include: { guardian: true } },
            feeAssignment: { include: { feeStructure: true } }
          }
        }
      }
    });

    if (!cheque) {
      throw new NotFoundError('Cheque record');
    }

    if (cheque.depositStatus === 'cleared') {
      return res.status(200).json(cheque);
    }

    let updatedCheque;

    await prisma.$transaction(async (tx) => {
      updatedCheque = await tx.chequeRecord.update({
        where: { id: cheque.id },
        data: { depositStatus: 'cleared' }
      });

      const currentYear = new Date().getFullYear();
      const successTxs = await tx.transaction.findMany({
        where: {
          status: 'success',
          receiptNumber: { startsWith: `REC-${currentYear}-` }
        }
      });

      let nextNum = 1;
      if (successTxs.length > 0) {
        const nums = successTxs.map(t => {
          const parts = t.receiptNumber.split('-');
          if (parts.length === 3) {
            const seq = parseInt(parts[2], 10);
            return isNaN(seq) ? 0 : seq;
          }
          return 0;
        });
        nextNum = Math.max(...nums) + 1;
      }
      const receiptNumber = `REC-${currentYear}-${String(nextNum).padStart(4, '0')}`;

      const updatedTx = await tx.transaction.update({
        where: { id: cheque.transactionId },
        data: {
          status: 'success',
          receiptNumber
        }
      });

      await tx.feeAssignment.update({
        where: { id: cheque.transaction.feeAssignmentId },
        data: { status: 'paid' }
      });

      const receiptBase64 = await generateReceiptBase64(
        updatedTx,
        cheque.transaction.student,
        cheque.transaction.student.guardian,
        cheque.transaction.feeAssignment.feeStructure
      );

      await tx.receipt.create({
        data: {
          transactionId: cheque.transactionId,
          receiptNumber,
          fileUrl: receiptBase64
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'clear_cheque',
          entity: 'cheque_record',
          entityId: cheque.id,
          before: { id: cheque.id, depositStatus: cheque.depositStatus },
          after: { id: cheque.id, depositStatus: 'cleared', receiptNumber }
        }
      });
    });

    return res.status(200).json(updatedCheque);

  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCheques,
  depositCheque,
  bounceCheque,
  clearCheque
};
