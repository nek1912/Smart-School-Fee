const prisma = require('../config/db');
const { logAudit } = require('../middlewares/audit');
const { ValidationError } = require('../errors/AppError');

const REQUIRED_COLUMNS = ['name', 'dob', 'class', 'division', 'guardianName', 'guardianPhone', 'feesStatus'];
const VALID_FEES_STATUS = ['paid', 'unpaid'];
const DIVISION_LIMIT = 30;

const validateRow = (row, index) => {
  const errors = [];

  for (const col of REQUIRED_COLUMNS) {
    if (!row[col] || String(row[col]).trim() === '') {
      errors.push({ row: index, reason: `Missing required field: ${col}` });
    }
  }

  if (row.feesStatus && !VALID_FEES_STATUS.includes(String(row.feesStatus).trim().toLowerCase())) {
    errors.push({ row: index, reason: `Invalid feesStatus: "${row.feesStatus}". Must be "paid" or "unpaid"` });
  }

  if (row.dob) {
    const date = new Date(row.dob);
    if (isNaN(date.getTime())) {
      errors.push({ row: index, reason: `Invalid date format for dob: "${row.dob}"` });
    }
  }

  return errors;
};

const getAvailableDivision = async (tx, className, requestedDivision) => {
  const fullClassName = `${className}-${requestedDivision}`;
  const divisionCount = await tx.student.count({
    where: { class: fullClassName }
  });

  if (divisionCount < DIVISION_LIMIT) {
    return requestedDivision;
  }

  const letters = 'BCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (const letter of letters) {
    const tryClassName = `${className}-${letter}`;
    const cnt = await tx.student.count({
      where: { class: tryClassName }
    });
    if (cnt < DIVISION_LIMIT) {
      return letter;
    }
  }

  return null;
};

const findOrCreateGuardian = async (tx, row) => {
  const phone = row.guardianPhone.trim();
  const email = row.guardianEmail ? row.guardianEmail.trim() : null;

  // Try to find existing guardian by phone
  const existing = await tx.guardian.findUnique({ where: { mobile: phone } });
  if (existing) {
    return existing;
  }

  // Create new guardian — generate unique email if not provided or if taken
  let guardianEmail = email || `${phone}@placeholder.local`;
  const emailTaken = await tx.guardian.findUnique({ where: { email: guardianEmail } });
  if (emailTaken) {
    guardianEmail = `${phone}_${Date.now()}@placeholder.local`;
  }

  return tx.guardian.create({
    data: {
      name: row.guardianName.trim(),
      mobile: phone,
      email: guardianEmail,
      passwordHash: 'imported-no-login',
      role: 'guardian'
    }
  });
};

const autoAssignFees = async (tx, student, className) => {
  // Find active academic year
  const activeYear = await tx.academicYear.findFirst({
    where: { isActive: true }
  });

  if (!activeYear) {
    console.log('[Import] No active academic year found, skipping fee assignment');
    return [];
  }

  // Find all fee structures that apply to this student's class
  // Match logic: exact class match (e.g., "Grade 5-A") or base class match (e.g., "Grade 5")
  const baseClass = className.split('-')[0]; // "Grade 5-A" → "Grade 5"
  
  const feeStructures = await tx.feeStructure.findMany({
    where: {
      academicYearId: activeYear.id,
      OR: [
        { appliesTo: className },        // Exact match: "Grade 5-A"
        { appliesTo: baseClass },         // Base class match: "Grade 5"
        { appliesTo: 'All' }              // Applies to all students
      ]
    }
  });

  const assignedFees = [];
  
  for (const fee of feeStructures) {
    // Check if assignment already exists
    const existing = await tx.feeAssignment.findUnique({
      where: {
        studentId_feeStructureId: {
          studentId: student.id,
          feeStructureId: fee.id
        }
      }
    });

    if (!existing) {
      // Create fee assignment with due date 30 days from now
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const assignment = await tx.feeAssignment.create({
        data: {
          studentId: student.id,
          feeStructureId: fee.id,
          dueDate,
          status: 'pending'
        }
      });
      assignedFees.push(assignment);
    }
  }

  return assignedFees;
};

const importStudents = async (req, res, next) => {
  try {
    const { students } = req.body;

    console.log('[Import] Received', students?.length, 'students');
    if (students && students.length > 0) {
      console.log('[Import] First row columns:', Object.keys(students[0]));
      console.log('[Import] First row:', JSON.stringify(students[0]));
    }

    if (!Array.isArray(students) || students.length === 0) {
      throw new ValidationError('students must be a non-empty array');
    }

    const firstRow = students[0];
    const actualColumns = Object.keys(firstRow);
    const missingColumns = REQUIRED_COLUMNS.filter(col => !actualColumns.includes(col));
    if (missingColumns.length > 0) {
      console.log('[Import] Missing columns:', missingColumns);
      throw new ValidationError(`Invalid columns. Missing: ${missingColumns.join(', ')}`);
    }

    const allErrors = [];
    for (let i = 0; i < students.length; i++) {
      const rowErrors = validateRow(students[i], i + 1);
      allErrors.push(...rowErrors);
    }

    if (allErrors.length > 0) {
      console.log('[Import] Validation errors:', allErrors.length);
      return res.status(400).json({
        imported: 0,
        skipped: students.length,
        errors: allErrors
      });
    }

    let imported = 0;
    let skipped = 0;
    let feesAssigned = 0;
    const errors = [];

    for (let i = 0; i < students.length; i++) {
      const row = students[i];
      try {
        const result = await prisma.$transaction(async (tx) => {
          const guardian = await findOrCreateGuardian(tx, row);

          const className = String(row.class).trim();
          const requestedDivision = String(row.division).trim().toUpperCase();
          const finalDivision = await getAvailableDivision(tx, className, requestedDivision);

          if (!finalDivision) {
            throw new Error(`All divisions full for class ${className}`);
          }

          const fullClassName = `${className}-${finalDivision}`;

          const student = await tx.student.create({
            data: {
              guardianId: guardian.id,
              name: row.name.trim(),
              class: fullClassName,
              dob: new Date(row.dob),
              status: 'active',
              feesStatus: String(row.feesStatus).trim().toLowerCase(),
              consentChecked: false,
              ocrFlagged: false
            }
          });

          // Auto-assign fees based on student's class
          const assignedFees = await autoAssignFees(tx, student, fullClassName);

          await logAudit({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'import_student',
            entity: 'student',
            entityId: student.id,
            before: null,
            after: { 
              name: student.name, 
              class: student.class, 
              feesStatus: student.feesStatus,
              feesAssigned: assignedFees.length
            }
          });

          return { student, feesAssigned: assignedFees.length };
        });

        imported++;
        feesAssigned += result.feesAssigned;
      } catch (err) {
        console.error(`[Import] Row ${i + 1} error:`, err.message);
        skipped++;
        errors.push({ row: i + 1, reason: err.message });
      }
    }

    return res.status(200).json({ imported, skipped, feesAssigned, errors });
  } catch (err) {
    next(err);
  }
};

module.exports = { importStudents };
