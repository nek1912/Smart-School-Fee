const prisma = require('../../config/db');

const applyLatePenaltyIfNeeded = async (assignment) => {
  const now = new Date();
  if (assignment.status !== 'pending' && assignment.status !== 'overdue') return;
  if (now <= new Date(assignment.dueDate)) return;

  const hasLatePenalty = assignment.waiverPenalties?.some(
    wp => wp.type === 'penalty' && wp.reason.includes('Late payment charge')
  );
  if (hasLatePenalty) return;

  await prisma.waiverPenalty.create({
    data: {
      feeAssignmentId: assignment.id,
      amount: 500.00,
      type: 'penalty',
      reason: 'Late payment charge (Overdue 30 days limit)'
    }
  });

  return prisma.feeAssignment.update({
    where: { id: assignment.id },
    data: { status: 'overdue' },
    include: {
      student: true,
      feeStructure: { include: { academicYear: true } },
      waiverPenalties: true
    }
  });
};

module.exports = { applyLatePenaltyIfNeeded };
