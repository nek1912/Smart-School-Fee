const prisma = require('../../config/db');

const getDefaulterData = async (sortBy, classFilter) => {
  const where = { status: { in: ['pending', 'overdue'] } };
  if (classFilter) where.student = { class: classFilter };

  const assignments = await prisma.feeAssignment.findMany({
    where,
    include: { student: true, feeStructure: true }
  });

  const now = new Date();
  const defaulters = assignments
    .filter(a => a.dueDate && now > new Date(a.dueDate))
    .map(a => {
      const overdueDays = Math.floor((now - new Date(a.dueDate)) / (1000 * 60 * 60 * 24));
      const overdueAmount = Number(a.feeStructure.amount);
      const riskPct = Math.min(99, Math.floor((overdueDays / 90) * 100));
      return {
        student_id: a.student.id,
        name: a.student.name,
        class: a.student.class,
        overdue_days: overdueDays,
        overdue_amount: overdueAmount,
        default_risk_pct: riskPct,
        guardian_name: a.student.guardian?.name || null,
        guardian_mobile: a.student.guardian?.mobile || null
      };
    });

  defaulters.sort((a, b) => {
    if (sortBy === 'days') return b.overdue_days - a.overdue_days;
    if (sortBy === 'amount') return b.overdue_amount - a.overdue_amount;
    return b.default_risk_pct - a.default_risk_pct;
  });

  return defaulters;
};

module.exports = { getDefaulterData };
