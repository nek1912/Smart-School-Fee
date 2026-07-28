const prisma = require('../config/db');
const { getStudentTimeline } = require('../domain/timeline/timelineService');
const { ValidationError, NotFoundError } = require('../errors/AppError');

const getTimeline = async (req, res, next) => {
  try {
    const studentId = Number(req.params.id);

    if (!studentId || isNaN(studentId)) {
      throw new ValidationError('Invalid student ID');
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      throw new NotFoundError('Student');
    }

    if (req.user.role === 'guardian' && student.guardianId !== req.user.id) {
      throw new ValidationError('You can only view timeline for your own children');
    }

    const { types, from, to, limit, before } = req.query;

    const result = await getStudentTimeline(studentId, { types, from, to, limit, before });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getTimeline };
