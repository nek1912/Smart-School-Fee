const prisma = require('../../config/db');

const getReportData = async (classFilter, startDate, endDate) => {
  const txnFilter = (status) => {
    const w = { status };
    const sw = {};
    if (classFilter) sw.class = classFilter;
    if (classFilter || (startDate && endDate)) w.student = { ...sw };
    if (startDate && endDate) w.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    return w;
  };

  const [successTxs, reversedTxs] = await Promise.all([
    prisma.transaction.findMany({
      where: txnFilter('success'),
      include: { feeAssignment: { include: { feeStructure: true } }, student: true }
    }),
    prisma.transaction.findMany({
      where: txnFilter('reversed'),
      include: { feeAssignment: { include: { feeStructure: true } }, student: true }
    })
  ]);

  const totalCollected = successTxs.reduce((acc, curr) => acc + Math.abs(Number(curr.amount)), 0);
  const totalRefunded = reversedTxs.reduce((acc, curr) => acc + Math.abs(Number(curr.amount)), 0);

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
  successTxs.forEach(t => {
    const type = t.feeAssignment?.feeStructure?.type || 'other';
    breakdownObj[type] = (breakdownObj[type] || 0) + Math.abs(Number(t.amount));
  });

  const breakdown = Object.entries(breakdownObj).map(([type, total]) => ({ type, total }));

  return { total_collected: totalCollected, total_refunded: totalRefunded, net_collected: totalCollected - totalRefunded, total_pending: totalPending, breakdown };
};

module.exports = { getReportData };
