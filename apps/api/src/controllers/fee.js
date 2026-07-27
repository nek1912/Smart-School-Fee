const prisma = require('../config/db');
const { logAudit } = require('../middlewares/audit');
const { ValidationError, NotFoundError } = require('../errors/AppError');

const getFeeStructures = async (req, res, next) => {
  try {
    const structures = await prisma.feeStructure.findMany({
      include: {
        academicYear: true
      },
      orderBy: [
        { name: 'asc' },
        { version: 'desc' }
      ]
    });
    return res.status(200).json(structures);
  } catch (err) {
    next(err);
  }
};

const createFeeStructure = async (req, res, next) => {
  try {
    const { name, amount, type, appliesTo, academicYearId } = req.body;

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
      include: {
        academicYear: true
      }
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'create_fee_structure',
      entity: 'fee_structure',
      entityId: feeStructure.id,
      before: null,
      after: feeStructure
    });

    return res.status(201).json(feeStructure);
  } catch (err) {
    next(err);
  }
};

const updateFeeStructure = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, amount, appliesTo } = req.body;

    const currentStructure = await prisma.feeStructure.findUnique({
      where: { id: Number(id) }
    });

    if (!currentStructure) {
      throw new NotFoundError('Fee structure');
    }

    const newVersionStructure = await prisma.feeStructure.create({
      data: {
        name: name || currentStructure.name,
        amount: amount !== undefined ? Number(amount) : currentStructure.amount,
        appliesTo: appliesTo || currentStructure.appliesTo,
        type: currentStructure.type,
        academicYearId: currentStructure.academicYearId,
        version: currentStructure.version + 1
      },
      include: {
        academicYear: true
      }
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'update_fee_structure',
      entity: 'fee_structure',
      entityId: newVersionStructure.id,
      before: currentStructure,
      after: newVersionStructure
    });

    return res.status(200).json(newVersionStructure);
  } catch (err) {
    next(err);
  }
};

const assignFee = async (req, res, next) => {
  try {
    const { studentId, feeStructureId, dueDate } = req.body;

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
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'assign_fee',
      entity: 'fee_assignment',
      entityId: assignment.id,
      before: null,
      after: assignment
    });

    return res.status(201).json(assignment);
  } catch (err) {
    next(err);
  }
};

const getAcademicYears = async (req, res, next) => {
  try {
    let count = await prisma.academicYear.count();
    if (count === 0) {
      await prisma.academicYear.create({
        data: {
          label: '2026-27',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2027-04-30'),
          isActive: true
        }
      });
    }
    const years = await prisma.academicYear.findMany({
      orderBy: { label: 'desc' }
    });
    return res.status(200).json(years);
  } catch (err) {
    next(err);
  }
};

const getFeeAssignments = async (req, res, next) => {
  try {
    const { studentId } = req.query;
    const role = req.user.role;
    let whereClause = {};

    if (studentId) {
      whereClause.studentId = Number(studentId);
    }

    if (role === 'guardian') {
      whereClause.student = { guardianId: req.user.id };
    }

    const assignments = await prisma.feeAssignment.findMany({
      where: whereClause,
      include: {
        student: true,
        feeStructure: {
          include: { academicYear: true }
        },
        waiverPenalties: true
      },
      orderBy: { dueDate: 'asc' }
    });

    const now = new Date();
    const checkedAssignments = [];

    for (const assignment of assignments) {
      if (
        (assignment.status === 'pending' || assignment.status === 'overdue') &&
        now > new Date(assignment.dueDate)
      ) {
        const hasLatePenalty = assignment.waiverPenalties.some(
          wp => wp.type === 'penalty' && wp.reason.includes('Late payment charge')
        );

        if (!hasLatePenalty) {
          await prisma.waiverPenalty.create({
            data: {
              feeAssignmentId: assignment.id,
              amount: 500.00,
              type: 'penalty',
              reason: 'Late payment charge (Overdue 30 days limit)'
            }
          });

          const updated = await prisma.feeAssignment.update({
            where: { id: assignment.id },
            data: { status: 'overdue' },
            include: {
              student: true,
              feeStructure: {
                include: { academicYear: true }
              },
              waiverPenalties: true
            }
          });

          checkedAssignments.push(updated);
          continue;
        }
      }
      checkedAssignments.push(assignment);
    }

    return res.status(200).json(checkedAssignments);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getFeeStructures,
  createFeeStructure,
  updateFeeStructure,
  assignFee,
  getAcademicYears,
  getFeeAssignments
};
