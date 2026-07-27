const prisma = require('../config/db');
const { listStructures, createStructure, updateStructure } = require('../domain/fees/structures');
const { getAssignments, createAssignment } = require('../domain/fees/assignments');

const getFeeStructures = async (req, res, next) => {
  try {
    const structures = await listStructures();
    return res.status(200).json(structures);
  } catch (err) { next(err); }
};

const createFeeStructure = async (req, res, next) => {
  try {
    const structure = await createStructure(req.body, req.user.id, req.user.role);
    return res.status(201).json(structure);
  } catch (err) { next(err); }
};

const updateFeeStructure = async (req, res, next) => {
  try {
    const structure = await updateStructure(req.params.id, req.body, req.user.id, req.user.role);
    return res.status(200).json(structure);
  } catch (err) { next(err); }
};

const assignFee = async (req, res, next) => {
  try {
    const assignment = await createAssignment(req.body, req.user.id, req.user.role);
    return res.status(201).json(assignment);
  } catch (err) { next(err); }
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
  } catch (err) { next(err); }
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

    const assignments = await getAssignments(whereClause);
    return res.status(200).json(assignments);
  } catch (err) { next(err); }
};

module.exports = {
  getFeeStructures,
  createFeeStructure,
  updateFeeStructure,
  assignFee,
  getAcademicYears,
  getFeeAssignments
};
