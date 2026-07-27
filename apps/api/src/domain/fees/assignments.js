const prisma = require('../../config/db');
const { logAudit } = require('../../middlewares/audit');
const { applyLatePenaltyIfNeeded } = require('./penalties');
const { ValidationError, NotFoundError } = require('../../errors/AppError');

const getAssignments = async (whereClause) => {
  const assignments = await prisma.feeAssignment.findMany({
    where: whereClause,
    include: {
      student: true,
      feeStructure: { include: { academicYear: true } },
      waiverPenalties: true
    },
    orderBy: { dueDate: 'asc' }
  });

  const results = [];
  for (const a of assignments) {
    const updated = await applyLatePenaltyIfNeeded(a);
    results.push(updated || a);
  }
  return results;
};

const createAssignment = async (data, userId, actorRole = null) => {
  const { studentId, feeStructureId, dueDate } = data;

  if (!studentId || !feeStructureId || !dueDate) {
    throw new ValidationError('studentId, feeStructureId, and dueDate are required');
  }

  const student = await prisma.student.findUnique({
    where: { id: Number(studentId) }
  });
  if (!student) {
    throw new NotFoundError('Student');
  }

  const feeStructure = await prisma.feeStructure.findUnique({
    where: { id: Number(feeStructureId) }
  });
  if (!feeStructure) {
    throw new NotFoundError('Fee structure');
  }

  const assignment = await prisma.feeAssignment.create({
    data: {
      studentId: Number(studentId),
      feeStructureId: Number(feeStructureId),
      dueDate: new Date(dueDate),
      status: 'pending'
    },
    include: {
      student: true,
      feeStructure: true
    }
  });

  await logAudit({
    actorId: userId,
    actorRole,
    action: 'assign_fee',
    entity: 'fee_assignment',
    entityId: assignment.id,
    before: null,
    after: assignment
  });

  return assignment;
};

module.exports = { getAssignments, createAssignment };
