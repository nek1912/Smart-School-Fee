const prisma = require('../../config/db');

const getMetricsData = async () => {
  const [successResult, reversedResult, inHandResult, pendingAssignments, todayResult, unreconciledResult] = await Promise.all([
    prisma.transaction.aggregate({ where: { status: 'success', method: { in: ['UPI', 'CASH', 'CHEQUE'] } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { status: 'reversed' }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { method: 'CASH', depositedAt: null, status: 'success' }, _sum: { amount: true } }),
    prisma.feeAssignment.findMany({ where: { status: { in: ['pending', 'overdue'] } }, include: { feeStructure: true, waiverPenalties: { where: { status: 'approved' } } } }),
    prisma.transaction.aggregate({ where: { status: 'success', createdAt: { gte: (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })() } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { status: 'success', method: { in: ['CASH', 'CHEQUE'] }, NOT: { depositedAt: null }, receiptRecord: { isNot: null } }, _sum: { amount: true } })
  ]);

  const bankBalance = Number(successResult._sum.amount || 0) + Number(reversedResult._sum.amount || 0);
  const inHandCash = Number(inHandResult._sum.amount || 0);

  let pendingFees = 0;
  pendingAssignments.forEach(item => {
    let amt = Number(item.feeStructure.amount);
    item.waiverPenalties.forEach(wp => {
      if (wp.type === 'penalty') amt += Number(wp.amount);
      else if (wp.type === 'waiver') amt -= Number(wp.amount);
    });
    pendingFees += amt;
  });

  const todayCollections = Number(todayResult._sum.amount || 0);
  const unreconciledDeposits = Number(unreconciledResult._sum.amount || 0);
  const refundedTotal = Number(reversedResult._sum.amount || 0);

  return {
    bank_balance: bankBalance,
    in_hand_cash: inHandCash,
    pending_fees: pendingFees,
    today_collections: todayCollections,
    unreconciled_deposits: unreconciledDeposits,
    refunded_total: refundedTotal
  };
};

module.exports = { getMetricsData };
