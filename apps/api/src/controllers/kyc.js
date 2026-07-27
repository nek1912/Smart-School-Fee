const prisma = require('../config/db');
const { logAudit } = require('../middlewares/audit');
const { encrypt } = require('../utils/crypto');
const { maskDocumentRef, minimizeOcrData } = require('../domain/privacy/masking');

// Helper to check string match (case-insensitive, ignores minor spaces)
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

// Helper to compare DOB
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

// Submit KYC (Stage 1 Signup)
const submitKYC = async (req, res) => {
  try {
    const { studentId, docType, docRef, ocrData } = req.body;

    if (!studentId || !docType || !ocrData) {
      return res.status(400).json({ error: 'studentId, docType, and ocrData are required' });
    }

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Verify guardian ownership
    if (req.user && req.user.role === 'guardian' && student.guardianId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
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

    // Update the student's ocrFlagged status
    await prisma.student.update({
      where: { id: Number(studentId) },
      data: { ocrFlagged }
    });

    // Log Audit Log
    await logAudit({
      actorId: req.user ? req.user.id : student.guardianId, // Fallback if self-submitting during signup
      actorRole: req.user ? req.user.role : 'guardian',
      action: 'submit_kyc',
      entity: 'student_kyc',
      entityId: studentKyc.id,
      before: null,
      after: { studentId, docType, docRef: maskedDocRef, ocrFlagged }
    });

    return res.status(200).json(studentKyc);
  } catch (error) {
    console.error('Submit KYC error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Fetch pending approvals for Admin
const getPendingApprovals = async (req, res) => {
  try {
    const pending = await prisma.student.findMany({
      where: {
        status: 'pending',
        kycRecord: { isNot: null }
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
  } catch (error) {
    console.error('Get approvals error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Direct Admin KYC approval (sets status active)
const approveKYC = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
      include: { kycRecord: true }
    });

    if (!student || !student.kycRecord) {
      return res.status(404).json({ error: 'Student or student KYC details not found' });
    }

    const updatedStudent = await prisma.$transaction(async (tx) => {
      // 1. Update Student status
      const s = await tx.student.update({
        where: { id: Number(studentId) },
        data: {
          status: 'active',
          ocrFlagged: false // reset flag since admin approved
        }
      });

      // 2. Mark KYC as verified
      await tx.studentKYC.update({
        where: { studentId: Number(studentId) },
        data: {
          verifiedAt: new Date(),
          ocrFlagged: false
        }
      });

      // 3. Auto-assign standard-wise (class-wise) fee structures
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
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days limit
              status: 'pending'
            }
          });
        }
      }

      return s;
    });

    // Log Audit
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
  } catch (error) {
    console.error('Approve KYC error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin Manual Override & Approval
const overrideKYC = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, dob, class: className } = req.body;

    if (!name || !dob || !className) {
      return res.status(400).json({ error: 'Corrected name, dob, and class are required for manual override' });
    }

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
      include: { kycRecord: true }
    });

    if (!student || !student.kycRecord) {
      return res.status(404).json({ error: 'Student or student KYC details not found' });
    }

    const updatedStudent = await prisma.$transaction(async (tx) => {
      // 1. Update Student with corrected details & set active
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

      // 2. Mark KYC verified and override flagged status
      await tx.studentKYC.update({
        where: { studentId: Number(studentId) },
        data: {
          verifiedAt: new Date(),
          ocrFlagged: false
        }
      });

      // 3. Auto-assign standard-wise (class-wise) fee structures
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
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days limit
              status: 'pending'
            }
          });
        }
      }

      return s;
    });

    // Log Audit
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
  } catch (error) {
    console.error('Override KYC error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const submitStage2KYC = async (req, res) => {
  try {
    const { student_id, bank_account, ifsc, passbook_photo_url } = req.body;

    if (!student_id || !bank_account || !ifsc) {
      return res.status(400).json({ error: 'student_id, bank_account, and ifsc are required' });
    }

    const studentKYC = await prisma.studentKYC.findUnique({
      where: { studentId: Number(student_id) }
    });

    if (!studentKYC) {
      return res.status(404).json({ error: 'Student Stage 1 KYC not found' });
    }

    const student = await prisma.student.findUnique({ where: { id: Number(student_id) } });
    if (req.user && req.user.role === 'guardian' && student && student.guardianId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }


    // Encrypt sensitive banking fields
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

    // Log to Audit Log
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

  } catch (error) {
    console.error('Submit stage 2 KYC error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getAllStudents = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      include: { guardian: true, kycRecord: true }
    });
    return res.status(200).json(students);
  } catch (error) {
    console.error('Get all students error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  submitKYC,
  getPendingApprovals,
  approveKYC,
  overrideKYC,
  getAllStudents,
  submitStage2KYC
};
