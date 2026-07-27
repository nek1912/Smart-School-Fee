const prisma = require('../../config/db');
const { logAudit } = require('../../middlewares/audit');
const { ValidationError, NotFoundError } = require('../../errors/AppError');

const listStructures = async () => {
  return prisma.feeStructure.findMany({
    include: { academicYear: true },
    orderBy: [
      { name: 'asc' },
      { version: 'desc' }
    ]
  });
};

const createStructure = async (data, userId, actorRole = null) => {
  const { name, amount, type, appliesTo, academicYearId } = data;

  if (!name || amount === undefined || !type || !appliesTo || !academicYearId) {
    throw new ValidationError('Name, amount, type, appliesTo, and academicYearId are required');
  }

  const allowedTypes = ['tuition', 'transport', 'late_fee', 'other'];
  if (!allowedTypes.includes(type)) {
    throw new ValidationError('Invalid fee type specified');
  }

  const feeStructure = await prisma.feeStructure.create({
    data: {
      name,
      amount: Number(amount),
      type,
      appliesTo,
      academicYearId: Number(academicYearId),
      version: 1
    },
    include: { academicYear: true }
  });

  await logAudit({
    actorId: userId,
    actorRole,
    action: 'create_fee_structure',
    entity: 'fee_structure',
    entityId: feeStructure.id,
    before: null,
    after: feeStructure
  });

  return feeStructure;
};

const updateStructure = async (id, data, userId, actorRole = null) => {
  const currentStructure = await prisma.feeStructure.findUnique({
    where: { id: Number(id) }
  });

  if (!currentStructure) {
    throw new NotFoundError('Fee structure');
  }

  const { name, amount, appliesTo } = data;

  const newVersionStructure = await prisma.feeStructure.create({
    data: {
      name: name || currentStructure.name,
      amount: amount !== undefined ? Number(amount) : currentStructure.amount,
      appliesTo: appliesTo || currentStructure.appliesTo,
      type: currentStructure.type,
      academicYearId: currentStructure.academicYearId,
      version: currentStructure.version + 1
    },
    include: { academicYear: true }
  });

  await logAudit({
    actorId: userId,
    actorRole,
    action: 'update_fee_structure',
    entity: 'fee_structure',
    entityId: newVersionStructure.id,
    before: currentStructure,
    after: newVersionStructure
  });

  return newVersionStructure;
};

module.exports = { listStructures, createStructure, updateStructure };
