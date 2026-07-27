const prisma = require('../config/db');
const { ValidationError, NotFoundError } = require('../errors/AppError');

const createWaiverPenalty = async (req, res, next) => {
  try {
    const { student_id, fee_assignment_id, amount, type, reason } = req.body;

    if (!student_id || !fee_assignment_id || !amount || !type || !reason) {
      throw new ValidationError('All fields are required: student_id, fee_assignment_id, amount, type, reason');
    }

    if (!['waiver', 'penalty'].includes(type)) {
      throw new ValidationError("Type must be either 'waiver' or 'penalty'");
    }

    const waiverPenalty = await prisma.waiverPenalty.create({
      data: {
        studentId: Number(student_id),
        feeAssignmentId: Number(fee_assignment_id),
        amount: Number(amount),
        type,
        reason,
        status: 'pending'
      },
      include: {
        student: true,
        feeAssignment: true
      }
    });

    return res.status(201).json(waiverPenalty);
  } catch (err) {
    next(err);
  }
};

const approveWaiverPenalty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const record = await prisma.waiverPenalty.findUnique({
      where: { id: Number(id) },
      include: { feeAssignment: { include: { feeStructure: true } } }
    });

    if (!record) {
      throw new NotFoundError('Waiver/penalty record');
    }

    if (record.status !== 'pending') {
      throw new ValidationError(`Record is already ${record.status}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.waiverPenalty.update({
        where: { id: Number(id) },
        data: {
          status: 'approved',
          approvedById: adminId,
          approvedAt: new Date()
        }
      });

      if (record.type === 'waiver') {
        const assignment = record.feeAssignment;
        const totalAmount = Number(assignment.feeStructure.amount);
        const waivedAmount = Number(record.amount);

        if (waivedAmount >= totalAmount) {
          await tx.feeAssignment.update({
            where: { id: assignment.id },
            data: { status: 'waived' }
          });
        }
      }

      return updatedRecord;
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: req.user.role,
        action: 'approve_waiver_penalty',
        entity: 'waiver_penalty',
        entityId: result.id,
        before: record,
        after: result
      }
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const rejectWaiverPenalty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason) {
      throw new ValidationError('Rejection reason is required');
    }

    const record = await prisma.waiverPenalty.findUnique({
      where: { id: Number(id) }
    });

    if (!record) {
      throw new NotFoundError('Waiver/penalty record');
    }

    if (record.status !== 'pending') {
      throw new ValidationError(`Record is already ${record.status}`);
    }

    const result = await prisma.waiverPenalty.update({
      where: { id: Number(id) },
      data: {
        status: 'rejected',
        rejectionReason: reason
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: req.user.role,
        action: 'reject_waiver_penalty',
        entity: 'waiver_penalty',
        entityId: result.id,
        before: record,
        after: result
      }
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const getWaiversPenalties = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) {
      where.status = status;
    }

    const records = await prisma.waiverPenalty.findMany({
      where,
      include: {
        student: true,
        feeAssignment: { include: { feeStructure: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json(records);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createWaiverPenalty,
  approveWaiverPenalty,
  rejectWaiverPenalty,
  getWaiversPenalties
};
