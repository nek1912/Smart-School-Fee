const prisma = require('../config/db');
const { generateReceiptBase64 } = require('../utils/receipts');
const { decrypt } = require('../utils/crypto');
const { ValidationError, NotFoundError } = require('../errors/AppError');

const initiateRefund = async (req, res, next) => {
  try {
    const { transaction_id, reason } = req.body;
    const adminId = req.user.id;

    if (!transaction_id || !reason) {
      throw new ValidationError('transaction_id and reason are required');
    }

    const originalTx = await prisma.transaction.findUnique({
      where: { id: Number(transaction_id) },
      include: {
        student: { include: { guardian: true } },
        feeAssignment: { include: { feeStructure: true } }
      }
    });

    if (!originalTx) {
      throw new NotFoundError('Original transaction');
    }

    if (originalTx.status !== 'success') {
      throw new ValidationError('Only successful transactions can be refunded');
    }

    const studentKYC = await prisma.studentKYC.findUnique({
      where: { studentId: originalTx.studentId }
    });

    if (!studentKYC || !studentKYC.isBankingComplete) {
      throw new ValidationError('Banking details required for refund. Please collect Stage 2 KYC.');
    }

    const existingRefund = await prisma.transaction.findFirst({
      where: {
        feeAssignmentId: originalTx.feeAssignmentId,
        method: 'REVERSAL',
        status: 'reversed',
        gatewayRef: `REFUND_${originalTx.id}`
      }
    });

    if (existingRefund) {
      throw new ValidationError('A refund has already been processed for this transaction');
    }

    const result = await prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const lastRef = await tx.transaction.findFirst({
        where: {
          status: 'reversed',
          receiptNumber: { startsWith: `REF-${currentYear}-` }
        },
        orderBy: { receiptNumber: 'desc' }
      });

      let nextRefSeq = 1;
      if (lastRef && lastRef.receiptNumber) {
        const parts = lastRef.receiptNumber.split('-');
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          nextRefSeq = lastSeq + 1;
        }
      }
      const receiptNumber = `REF-${currentYear}-${String(nextRefSeq).padStart(4, '0')}`;

      const refundTransaction = await tx.transaction.create({
        data: {
          studentId: originalTx.studentId,
          feeAssignmentId: originalTx.feeAssignmentId,
          amount: -Number(originalTx.amount),
          method: 'REVERSAL',
          status: 'reversed',
          gatewayRef: `REFUND_${originalTx.id}`,
          receiptNumber,
          idempotencyKey: `refund_${originalTx.id}`
        }
      });

      await tx.feeAssignment.update({
        where: { id: originalTx.feeAssignmentId },
        data: { status: 'pending' }
      });

      const receiptBase64 = await generateReceiptBase64(
        refundTransaction,
        originalTx.student,
        originalTx.student.guardian,
        originalTx.feeAssignment.feeStructure
      );

      await tx.receipt.create({
        data: {
          transactionId: refundTransaction.id,
          receiptNumber,
          fileUrl: receiptBase64
        }
      });

      return { refundTransaction, receiptNumber, receiptBase64 };
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: req.user.role,
        action: 'initiate_refund',
        entity: 'refund',
        entityId: result.refundTransaction.id,
        before: originalTx,
        after: result.refundTransaction
      }
    });

    const decryptedAccount = decrypt(studentKYC.bankAccount);
    console.log(`\n--- [SMS/EMAIL NOTIFICATION] ---\nTo: ${originalTx.student.guardian.email}\nDear ${originalTx.student.guardian.name}, your refund of INR ${Number(originalTx.amount).toFixed(2)} has been successfully processed to Account: ****${decryptedAccount ? decryptedAccount.slice(-4) : 'N/A'}. Reason: ${reason}. Receipt: REF-${result.receiptNumber}\n---------------------------------\n`);

    return res.status(200).json({
      success: true,
      message: 'Refund initiated successfully',
      refund_transaction: result.refundTransaction,
      receipt_number: result.receiptNumber
    });

  } catch (err) {
    next(err);
  }
};

module.exports = {
  initiateRefund
};
