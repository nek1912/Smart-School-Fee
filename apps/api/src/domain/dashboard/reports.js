const prisma = require('../../config/db');

const getReportData = async (classFilter, startDate, endDate) => {
  const txWhere = { status: 'success' };
  if (classFilter) txWhere.student = { class: classFilter };
  if (startDate && endDate) {
    txWhere.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const txs = await prisma.transaction.findMany({
    where: txWhere,
    include: { feeAssignment: { include: { feeStructure: true } } }
  });

  const totalCollected = txs.reduce((acc, curr) => acc + Number(curr.amount), 0);

  const pendingWhere = { status: { in: ['pending', 'overdue'] } };
  if (classFilter) pendingWhere.student = { class: classFilter };
  if (startDate && endDate) {
    pendingWhere.dueDate = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  const pendingAssignments = await prisma.feeAssignment.findMany({
    where: pendingWhere,
    include: { feeStructure: true, waiverPenalties: { where: { status: 'approved' } } }
  });

  const totalPending = pendingAssignments.reduce((acc, item) => {
    let amt = Number(item.feeStructure.amount);
    item.waiverPenalties.forEach(wp => {
      if (wp.type === 'penalty') amt += Number(wp.amount);
      else if (wp.type === 'waiver') amt -= Number(wp.amount);
    });
    return acc + amt;
  }, 0);

  const breakdownObj = {};
  txs.forEach(t => {
    const type = t.feeAssignment.feeStructure.type;
    breakdownObj[type] = (breakdownObj[type] || 0) + Number(t.amount);
  });

  const breakdown = Object.entries(breakdownObj).map(([type, total]) => ({ type, total }));

  return { total_collected: totalCollected, total_pending: totalPending, breakdown };
};

module.exports = { getReportData };
