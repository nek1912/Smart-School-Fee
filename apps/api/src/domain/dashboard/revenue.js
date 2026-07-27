const prisma = require('../../config/db');

const getRevenueData = async (period, classFilter) => {
  const now = new Date();
  let startDate;
  if (period === 'daily') {
    startDate = new Date(now.setHours(0, 0, 0, 0));
  } else if (period === 'weekly') {
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } else {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
