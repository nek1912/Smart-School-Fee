const prisma = require('../../config/db');

const getRevenueData = async (period, classFilter) => {
  const now = new Date();
  let startDate;
  switch (period) {
    case 'daily': startDate = new Date(now.setHours(0,0,0,0)); break;
    case 'weekly': startDate = new Date(now.setDate(now.getDate()-7)); break;
    case 'monthly': default: startDate = new Date(now.setMonth(now.getMonth()-1)); break;
  }

  const where = { status: 'success', createdAt: { gte: startDate } };
  if (classFilter) where.student = { class: classFilter };

  const txs = await prisma.transaction.findMany({
    where,
    include: { feeAssignment: { include: { feeStructure: true } } }
  });

  const breakdownObj = {};
  txs.forEach(t => {
    const type = t.feeAssignment.feeStructure.type;
    breakdownObj[type] = (breakdownObj[type] || 0) + Number(t.amount);
  });

  const labels = Object.keys(breakdownObj);
  const data = Object.values(breakdownObj);

  return { labels, data };
};

module.exports = { getRevenueData };
