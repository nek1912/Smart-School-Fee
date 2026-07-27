const { generateReceiptBase64 } = require('../../utils/receipts');

const formatReceiptNumber = (year, sequence) => `REC-${year}-${String(sequence).padStart(4, '0')}`;

const allocateReceiptNumber = async ({ tx, year = new Date().getFullYear() }) => {
  const sequence = await tx.receiptSequence.upsert({
    where: { year },
    update: { nextValue: { increment: 1 } },
    create: { year, nextValue: 2 }
  });
  return formatReceiptNumber(year, sequence.nextValue - 1);
};

const createReceiptForTransaction = async ({ tx, transaction, student, guardian, feeStructure }) => {
  const receiptNumber = await allocateReceiptNumber({ tx });
  const updatedTransaction = await tx.transaction.update({
    where: { id: transaction.id },
    data: { receiptNumber }
  });
  const receiptBase64 = await generateReceiptBase64(updatedTransaction, student, guardian, feeStructure);
  const receipt = await tx.receipt.create({
    data: {
      transactionId: transaction.id,
      receiptNumber,
      fileUrl: receiptBase64
    }
  });
  return { receiptNumber, receipt, transaction: updatedTransaction };
};

module.exports = {
  formatReceiptNumber,
  allocateReceiptNumber,
  createReceiptForTransaction
};