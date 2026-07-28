const prisma = require('../config/db');
const { logAudit } = require('../middlewares/audit');
const { encrypt } = require('../utils/crypto');
const { maskDocumentRef, minimizeOcrData } = require('../domain/privacy/masking');
const { ValidationError, NotFoundError, AppError } = require('../errors/AppError');

const isNameMatch = (name1, name2) => {
  if (!name1 || !name2) return false;

  const getWords = (str) => {
    return str.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);
  };

  const w1 = getWords(name1);
  const w2 = getWords(name2);

  if (w1.length === 0 || w2.length === 0) {
    const clean = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    return clean(name1) === clean(name2);
  }

  const [short, long] = w1.length < w2.length ? [w1, w2] : [w2, w1];
  const matches = short.filter(w => long.includes(w));
  return matches.length === short.length;
};

const isDateMatch = (date1, date2) => {
  if (!date1 || !date2) return false;
  try {
    const d1 = new Date(date1).toDateString();
    const d2 = new Date(date2).toDateString();
    return d1 === d2;
  } catch (err) {
    return false;
  }
};

const submitKYC = async (req, res, next) => {
  try {
    const { studentId, docType, docRef, ocrData } = req.body;

    if (!studentId || !docType || !ocrData) {
      throw new ValidationError('studentId, docType, and ocrData are required');
    }

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) }
    });

    if (!student) {
      throw new NotFoundError('Student');
    }

    if (req.user && req.user.role === 'guardian' && student.guardianId !== req.user.id) {
      throw new AppError('Forbidden: Access denied', 403);
    }

    const safeOcrData = minimizeOcrData(ocrData);
    const ocrName = safeOcrData.name;
    const ocrDob = safeOcrData.dob;

    const nameMatches = isNameMatch(student.name, ocrName);
    const dobMatches = isDateMatch(student.dob, ocrDob);

    const ocrFlagged = !nameMatches || !dobMatches;

    const maskedDocRef = maskDocumentRef(docRef);

    const studentKyc = await prisma.studentKYC.upsert({
      where: { studentId: Number(studentId) },
      update: {
        docType,
        docRef: maskedDocRef,
        ocrData: safeOcrData,
        ocrFlagged,
        verifiedAt: null
      },
      create: {
        studentId: Number(studentId),
        docType,
        docRef: maskedDocRef,
        ocrData: safeOcrData,
        ocrFlagged
      }
    });

    await prisma.student.update({
      where: { id: Number(studentId) },
      data: { ocrFlagged }
    });

    await logAudit({
      actorId: req.user ? req.user.id : student.guardianId,
      actorRole: req.user ? req.user.role : 'guardian',
      action: 'submit_kyc',
      entity: 'student_kyc',
      entityId: studentKyc.id,
      before: null,
      after: { studentId, docType, docRef: maskedDocRef, ocrFlagged }
    });

    return res.status(200).json(studentKyc);
  } catch (err) {
    next(err);
  }
};

const getPendingApprovals = async (req, res, next) => {
  try {
    const pending = await prisma.student.findMany({
      where: {
        status: 'pending'
      },
      include: {
        guardian: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true
          }
        },
        kycRecord: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json(pending);
  } catch (err) {
    next(err);
  }
};

const approveKYC = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
      include: { kycRecord: true }
    });

    if (!student) {
      throw new NotFoundError('Student');
    }

    const updatedStudent = await prisma.$transaction(async (tx) => {
      const s = await tx.student.update({
        where: { id: Number(studentId) },
        data: {
          status: 'active',
          ocrFlagged: false
        }
      });

      if (student.kycRecord) {
        await tx.studentKYC.update({
          where: { studentId: Number(studentId) },
          data: {
            verifiedAt: new Date(),
            ocrFlagged: false
          }
        });
      }

      const feeStructures = await tx.feeStructure.findMany({
        where: {
          OR: [
            { appliesTo: 'all' },
            { appliesTo: s.class },
            { appliesTo: s.class.split('-')[0] }
          ]
        }
      });

      for (const fs of feeStructures) {
        const existing = await tx.feeAssignment.findFirst({
          where: {
            studentId: s.id,
            feeStructureId: fs.id
          }
        });
        if (!existing) {
          await tx.feeAssignment.create({
            data: {
              studentId: s.id,
              feeStructureId: fs.id,
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              status: 'pending'
            }
          });
        }
      }

      return s;
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'approve_kyc',
      entity: 'student',
      entityId: updatedStudent.id,
      before: student,
      after: updatedStudent
    });

    return res.status(200).json({
      success: true,
      message: 'KYC verified and student marked active',
      student: updatedStudent
    });
  } catch (err) {
    next(err);
  }
};

const overrideKYC = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { name, dob, class: className } = req.body;

    if (!name || !dob || !className) {
      throw new ValidationError('Corrected name, dob, and class are required for manual override');
    }

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
      include: { kycRecord: true }
    });

    if (!student) {
      throw new NotFoundError('Student');
    }

    const updatedStudent = await prisma.$transaction(async (tx) => {
      const s = await tx.student.update({
        where: { id: Number(studentId) },
        data: {
          name,
          dob: new Date(dob),
          class: className,
          status: 'active',
          ocrFlagged: false
        }
      });

      if (student.kycRecord) {
        await tx.studentKYC.update({
          where: { studentId: Number(studentId) },
          data: {
            verifiedAt: new Date(),
            ocrFlagged: false
          }
        });
      }

      const feeStructures = await tx.feeStructure.findMany({
        where: {
          OR: [
            { appliesTo: 'all' },
            { appliesTo: s.class },
            { appliesTo: s.class.split('-')[0] }
          ]
        }
      });

      for (const fs of feeStructures) {
        const existing = await tx.feeAssignment.findFirst({
          where: {
            studentId: s.id,
            feeStructureId: fs.id
          }
        });
        if (!existing) {
          await tx.feeAssignment.create({
            data: {
              studentId: s.id,
              feeStructureId: fs.id,
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              status: 'pending'
            }
          });
        }
      }

      return s;
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'override_kyc',
      entity: 'student',
      entityId: updatedStudent.id,
      before: student,
      after: updatedStudent
    });

    return res.status(200).json({
      success: true,
      message: 'KYC manually overridden and approved successfully',
      student: updatedStudent
    });
  } catch (err) {
    next(err);
  }
};

const submitStage2KYC = async (req, res, next) => {
  try {
    const { student_id, bank_account, ifsc, passbook_photo_url } = req.body;

    if (!student_id || !bank_account || !ifsc) {
      throw new ValidationError('student_id, bank_account, and ifsc are required');
    }

    const studentKYC = await prisma.studentKYC.findUnique({
      where: { studentId: Number(student_id) }
    });

    if (!studentKYC) {
      throw new NotFoundError('Student Stage 1 KYC');
    }

    const student = await prisma.student.findUnique({ where: { id: Number(student_id) } });
    if (req.user && req.user.role === 'guardian' && student && student.guardianId !== req.user.id) {
      throw new AppError('Forbidden: Access denied', 403);
    }

    const encryptedBankAccount = encrypt(bank_account);
    const encryptedIfsc = encrypt(ifsc);

    const updated = await prisma.studentKYC.update({
      where: { studentId: Number(student_id) },
      data: {
        bankAccount: encryptedBankAccount,
        ifsc: encryptedIfsc,
        passbookPhotoUrl: passbook_photo_url || null,
        isBankingComplete: true
      }
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'submit_stage2_kyc',
      entity: 'student_kyc',
      entityId: updated.id,
      before: studentKYC,
      after: updated
    });

    return res.status(200).json({
      success: true,
      message: 'Stage 2 banking details submitted successfully',
      kycRecord: updated
    });

  } catch (err) {
    next(err);
  }
};

const getAllStudents = async (req, res, next) => {
  try {
    const { search, class: className, division, feesStatus } = req.query;

    const where = {};

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (feesStatus) {
      where.feesStatus = { equals: feesStatus };
    }

    if (className) {
      where.class = { startsWith: className };
    }

    if (division) {
      where.class = { ...where.class, endsWith: `-${division}` };
    }

    const students = await prisma.student.findMany({
      where,
      include: { guardian: true, kycRecord: true },
      orderBy: { name: 'asc' }
    });
    return res.status(200).json(students);
  } catch (err) {
    next(err);
  }
};

const rejectStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) }
    });

    if (!student) {
      throw new NotFoundError('Student');
    }

    const updated = await prisma.student.update({
      where: { id: Number(studentId) },
      data: { status: 'rejected' }
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'reject_student',
      entity: 'student',
      entityId: student.id,
      before: { id: student.id, status: student.status },
      after: { id: updated.id, status: updated.status }
    });

    return res.status(200).json({
      success: true,
      message: 'Student registration rejected',
      student: updated
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  submitKYC,
  getPendingApprovals,
  approveKYC,
  overrideKYC,
  getAllStudents,
  submitStage2KYC,
  rejectStudent
};
