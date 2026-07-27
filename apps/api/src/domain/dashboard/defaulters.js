const prisma = require('../../config/db');

const getDefaulterData = async (sortBy, classFilter) => {
  const where = { status: { in: ['pending', 'overdue'] } };
  if (classFilter) where.student = { class: classFilter };

  const assignments = await prisma.feeAssignment.findMany({
    where,
    include: {
      student: {
        include: {
          guardian: true,
          transactions: { where: { status: 'failed' } }
        }
      },
      feeStructure: true,
      waiverPenalties: { where: { status: 'approved' } }
    }
  });

  const now = new Date();
  const defaulters = assignments.map(a => {
    let overdueAmount = Number(a.feeStructure.amount);
    a.waiverPenalties.forEach(wp => {
      if (wp.type === 'penalty') overdueAmount += Number(wp.amount);
      else if (wp.type === 'waiver') overdueAmount -= Number(wp.amount);
    });

    const dueDate = new Date(a.dueDate);
    const diffTime = Math.max(0, now - dueDate);
    const overdueDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const failedCount = a.student.transactions.length;
    const isKycComplete = a.student.status === 'active';

    let riskFactor = overdueDays * 3;
    riskFactor += failedCount * 20;
    if (isKycComplete) riskFactor -= 15;
    else riskFactor += 15;
    if (overdueAmount > 15000) riskFactor += 15;
    else if (overdueAmount < 5000) riskFactor -= 10;
    const defaultRiskPct = Math.min(98, Math.max(5, riskFactor));

    return {
      student_id: a.student.id,
      name: a.student.name,
      class: a.student.class,
      overdue_days: overdueDays,
      overdue_amount: overdueAmount,
      default_risk_pct: defaultRiskPct,
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
