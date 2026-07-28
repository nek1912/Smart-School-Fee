const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function findOrCreateFeeStructure(prisma, data) {
  const existing = await prisma.feeStructure.findFirst({
    where: { name: data.name, type: data.type, academicYearId: data.academicYearId }
  });
  if (existing) return existing;
  return prisma.feeStructure.create({ data });
}

async function findOrCreateStudent(prisma, data) {
  const existing = await prisma.student.findFirst({
    where: { name: data.name, class: data.class }
  });
  if (existing) return existing;
  return prisma.student.create({ data });
}

async function main() {
  console.log('🌱 Seeding database with default cashier/admin credentials and E2E records...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Upsert Academic Year
  let ay = await prisma.academicYear.findFirst({ where: { label: 'AY 2026-27' } });
  if (!ay) {
    ay = await prisma.academicYear.create({
      data: {
        label: 'AY 2026-27',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-04-30'),
        isActive: true
      }
    });
  }

  // 2. Upsert Fee Structures
  const tuitionFee = await findOrCreateFeeStructure(prisma, {
    academicYearId: ay.id,
    name: 'Tuition Fee - Term 1',
    amount: 25000.00,
    type: 'tuition',
    appliesTo: 'Grade 5-A'
  });

  const transportFee = await findOrCreateFeeStructure(prisma, {
    academicYearId: ay.id,
    name: 'Transport Fee - Q1',
    amount: 5000.00,
    type: 'transport',
    appliesTo: 'Grade 5-A'
  });

  // 3. Upsert Admin Guardian
  const admin = await prisma.guardian.upsert({
    where: { mobile: '9265218085' },
    update: { name: 'Super Admin', email: 'admin@smartschool.com', passwordHash, role: 'admin' },
    create: { name: 'Super Admin', mobile: '9265218085', email: 'admin@smartschool.com', passwordHash, role: 'admin' }
  });

  // 4. Upsert Cashier Guardian
  const cashierUser = await prisma.guardian.upsert({
    where: { mobile: '9898989898' },
    update: { name: 'Primary Cashier', email: 'cashier@smartschool.com', passwordHash, role: 'cashier' },
    create: { name: 'Primary Cashier', mobile: '9898989898', email: 'cashier@smartschool.com', passwordHash, role: 'cashier' }
  });

  // 5. Upsert Cashier profile
  await prisma.cashier.upsert({
    where: { userId: cashierUser.id },
    update: { createdByAdminId: admin.id, status: 'active' },
    create: { userId: cashierUser.id, createdByAdminId: admin.id }
  });

  // 6. Upsert Parent Guardian
  const parent = await prisma.guardian.upsert({
    where: { mobile: '9696969696' },
    update: { name: 'Rajeshbhai Ravtode', email: 'parent@smartschool.com', passwordHash, role: 'guardian' },
    create: { name: 'Rajeshbhai Ravtode', mobile: '9696969696', email: 'parent@smartschool.com', passwordHash, role: 'guardian' }
  });

  // 7. Upsert Student (no unique constraint on name+class, so findFirst + create)
  let student = await prisma.student.findFirst({
    where: { name: 'Ravtode Ronak Rajeshbhai', class: 'Grade 5-A' }
  });
  if (!student) {
    student = await prisma.student.create({
      data: {
        guardianId: parent.id,
        name: 'Ravtode Ronak Rajeshbhai',
        class: 'Grade 5-A',
        status: 'active',
        consentChecked: true,
        consentTimestamp: new Date(),
        dob: new Date('2015-08-15'),
        ocrFlagged: false
      }
    });
  }

  // 8. Upsert Student KYC (studentId is unique)
  await prisma.studentKYC.upsert({
    where: { studentId: student.id },
    update: {
      docType: 'aadhaar',
      docRef: 'XXXX-XXXX-1234',
      ocrData: { name: 'Ravtode Ronak Rajeshbhai', dob: '2015-08-15' },
      ocrFlagged: false,
      verifiedAt: new Date()
    },
    create: {
      studentId: student.id,
      docType: 'aadhaar',
      docRef: 'XXXX-XXXX-1234',
      ocrData: { name: 'Ravtode Ronak Rajeshbhai', dob: '2015-08-15' },
      ocrFlagged: false,
      verifiedAt: new Date()
    }
  });

  // 9. Upsert Fee Assignments (has @@unique([studentId, feeStructureId]))
  const tuitionAssign = await prisma.feeAssignment.upsert({
    where: { studentId_feeStructureId: { studentId: student.id, feeStructureId: tuitionFee.id } },
    update: { dueDate: new Date('2026-09-01'), status: 'pending' },
    create: { studentId: student.id, feeStructureId: tuitionFee.id, dueDate: new Date('2026-09-01'), status: 'pending' }
  });

  const transportAssign = await prisma.feeAssignment.upsert({
    where: { studentId_feeStructureId: { studentId: student.id, feeStructureId: transportFee.id } },
    update: { dueDate: new Date('2026-07-01'), status: 'overdue' },
    create: { studentId: student.id, feeStructureId: transportFee.id, dueDate: new Date('2026-07-01'), status: 'overdue' }
  });

  // 10. Upsert failed transactions (fixed idempotency keys for repeatability)
  await prisma.transaction.upsert({
    where: { idempotencyKey: 'SEED_FAIL_KEY_1' },
    update: {
      studentId: student.id,
      feeAssignmentId: transportAssign.id,
      amount: 5000.00,
      method: 'UPI',
      status: 'failed',
      gatewayRef: 'ORD_SEED_FAIL_1'
    },
    create: {
      studentId: student.id,
      feeAssignmentId: transportAssign.id,
      amount: 5000.00,
      method: 'UPI',
      status: 'failed',
      gatewayRef: 'ORD_SEED_FAIL_1',
      idempotencyKey: 'SEED_FAIL_KEY_1'
    }
  });

  await prisma.transaction.upsert({
    where: { idempotencyKey: 'SEED_FAIL_KEY_2' },
    update: {
      studentId: student.id,
      feeAssignmentId: transportAssign.id,
      amount: 5000.00,
      method: 'UPI',
      status: 'failed',
      gatewayRef: 'ORD_SEED_FAIL_2'
    },
    create: {
      studentId: student.id,
      feeAssignmentId: transportAssign.id,
      amount: 5000.00,
      method: 'UPI',
      status: 'failed',
      gatewayRef: 'ORD_SEED_FAIL_2',
      idempotencyKey: 'SEED_FAIL_KEY_2'
    }
  });

  // 11. Seed receipt sequence for current year
  await prisma.receiptSequence.upsert({
    where: { year: new Date().getFullYear() },
    update: {},
    create: { year: new Date().getFullYear(), nextValue: 1 }
  });

  // ===== ADDITIONAL FEE STRUCTURES FOR OTHER GRADES =====
  const tuitionFee6B = await findOrCreateFeeStructure(prisma, {
    academicYearId: ay.id,
    name: 'Tuition Fee - Term 1',
    amount: 28000.00,
    type: 'tuition',
    appliesTo: 'Grade 6-B'
  });

  const tuitionFee7C = await findOrCreateFeeStructure(prisma, {
    academicYearId: ay.id,
    name: 'Tuition Fee - Term 1',
    amount: 30000.00,
    type: 'tuition',
    appliesTo: 'Grade 7-C'
  });

  const tuitionFee4A = await findOrCreateFeeStructure(prisma, {
    academicYearId: ay.id,
    name: 'Tuition Fee - Term 1',
    amount: 22000.00,
    type: 'tuition',
    appliesTo: 'Grade 4-A'
  });

  // ===== ADDITIONAL GUARDIANS FOR STUDENTS 2-5 =====
  const parent2 = await prisma.guardian.upsert({
    where: { mobile: '9696969697' },
    update: { name: 'Rajesh Patel', email: 'parent2@smartschool.com', passwordHash, role: 'guardian' },
    create: { name: 'Rajesh Patel', mobile: '9696969697', email: 'parent2@smartschool.com', passwordHash, role: 'guardian' }
  });

  const parent3 = await prisma.guardian.upsert({
    where: { mobile: '9696969698' },
    update: { name: 'Vikram Singh', email: 'parent3@smartschool.com', passwordHash, role: 'guardian' },
    create: { name: 'Vikram Singh', mobile: '9696969698', email: 'parent3@smartschool.com', passwordHash, role: 'guardian' }
  });

  const parent4 = await prisma.guardian.upsert({
    where: { mobile: '9696969699' },
    update: { name: 'Amit Verma', email: 'parent4@smartschool.com', passwordHash, role: 'guardian' },
    create: { name: 'Amit Verma', mobile: '9696969699', email: 'parent4@smartschool.com', passwordHash, role: 'guardian' }
  });

  const parent5 = await prisma.guardian.upsert({
    where: { mobile: '9696969700' },
    update: { name: 'Dev Sharma', email: 'parent5@smartschool.com', passwordHash, role: 'guardian' },
    create: { name: 'Dev Sharma', mobile: '9696969700', email: 'parent5@smartschool.com', passwordHash, role: 'guardian' }
  });

  // ===== STUDENT 2: Patel Priya Rajesh (Grade 6-B, KYC, paid tuition, 2 success txns) =====
  const student2 = await findOrCreateStudent(prisma, {
    guardianId: parent2.id,
    name: 'Patel Priya Rajesh',
    class: 'Grade 6-B',
    status: 'active',
    consentChecked: true,
    consentTimestamp: new Date(),
    dob: new Date('2014-03-20'),
    ocrFlagged: false
  });

  await prisma.studentKYC.upsert({
    where: { studentId: student2.id },
    update: {
      docType: 'aadhaar',
      docRef: 'XXXX-XXXX-5678',
      ocrData: { name: 'Patel Priya Rajesh', dob: '2014-03-20' },
      ocrFlagged: false,
      verifiedAt: new Date()
    },
    create: {
      studentId: student2.id,
      docType: 'aadhaar',
      docRef: 'XXXX-XXXX-5678',
      ocrData: { name: 'Patel Priya Rajesh', dob: '2014-03-20' },
      ocrFlagged: false,
      verifiedAt: new Date()
    }
  });

  const assignS2Tuition = await prisma.feeAssignment.upsert({
    where: { studentId_feeStructureId: { studentId: student2.id, feeStructureId: tuitionFee6B.id } },
    update: { dueDate: new Date('2026-09-01'), status: 'paid' },
    create: { studentId: student2.id, feeStructureId: tuitionFee6B.id, dueDate: new Date('2026-09-01'), status: 'paid' }
  });

  const txS2a = await prisma.transaction.upsert({
    where: { idempotencyKey: 'SEED_S2_TX1' },
    update: {
      studentId: student2.id,
      feeAssignmentId: assignS2Tuition.id,
      amount: 20000.00,
      method: 'UPI',
      status: 'success',
      gatewayRef: 'ORD_S2_TX1',
      depositedAt: new Date('2026-07-15')
    },
    create: {
      studentId: student2.id,
      feeAssignmentId: assignS2Tuition.id,
      amount: 20000.00,
      method: 'UPI',
      status: 'success',
      gatewayRef: 'ORD_S2_TX1',
      idempotencyKey: 'SEED_S2_TX1',
      depositedAt: new Date('2026-07-15')
    }
  });

  const txS2b = await prisma.transaction.upsert({
    where: { idempotencyKey: 'SEED_S2_TX2' },
    update: {
      studentId: student2.id,
      feeAssignmentId: assignS2Tuition.id,
      amount: 8000.00,
      method: 'CASH',
      status: 'success',
      gatewayRef: 'ORD_S2_TX2',
      depositedAt: new Date('2026-08-01')
    },
    create: {
      studentId: student2.id,
      feeAssignmentId: assignS2Tuition.id,
      amount: 8000.00,
      method: 'CASH',
      status: 'success',
      gatewayRef: 'ORD_S2_TX2',
      idempotencyKey: 'SEED_S2_TX2',
      depositedAt: new Date('2026-08-01')
    }
  });

  // ===== STUDENT 2 LEDGER ENTRIES (refunds) =====
  const existingLedger1 = await prisma.ledgerEntry.findFirst({
    where: { studentId: student2.id, reference: 'REFUND_OVERPAYMENT_1' }
  });
  if (!existingLedger1) {
    await prisma.ledgerEntry.create({
      data: {
        studentId: student2.id,
        transactionId: txS2a.id,
        type: 'refund',
        direction: 'in',
        amount: 500.00,
        reference: 'REFUND_OVERPAYMENT_1',
        note: 'Refund for excess payment on tuition fee'
      }
    });
  }

  const existingLedger2 = await prisma.ledgerEntry.findFirst({
    where: { studentId: student2.id, reference: 'REFUND_OVERPAYMENT_2' }
  });
  if (!existingLedger2) {
    await prisma.ledgerEntry.create({
      data: {
        studentId: student2.id,
        transactionId: txS2b.id,
        type: 'refund',
        direction: 'in',
        amount: 250.00,
        reference: 'REFUND_OVERPAYMENT_2',
        note: 'Refund for cash payment adjustment'
      }
    });
  }

  // ===== STUDENT 3: Singh Arjun Vikram (Grade 5-A, KYC, transport overdue, cheque pending) =====
  const student3 = await findOrCreateStudent(prisma, {
    guardianId: parent3.id,
    name: 'Singh Arjun Vikram',
    class: 'Grade 5-A',
    status: 'active',
    consentChecked: true,
    consentTimestamp: new Date(),
    dob: new Date('2015-11-10'),
    ocrFlagged: false
  });

  await prisma.studentKYC.upsert({
    where: { studentId: student3.id },
    update: {
      docType: 'aadhaar',
      docRef: 'XXXX-XXXX-9012',
      ocrData: { name: 'Singh Arjun Vikram', dob: '2015-11-10' },
      ocrFlagged: false,
      verifiedAt: new Date()
    },
    create: {
      studentId: student3.id,
      docType: 'aadhaar',
      docRef: 'XXXX-XXXX-9012',
      ocrData: { name: 'Singh Arjun Vikram', dob: '2015-11-10' },
      ocrFlagged: false,
      verifiedAt: new Date()
    }
  });

  const assignS3Transport = await prisma.feeAssignment.upsert({
    where: { studentId_feeStructureId: { studentId: student3.id, feeStructureId: transportFee.id } },
    update: { dueDate: new Date('2026-07-01'), status: 'overdue' },
    create: { studentId: student3.id, feeStructureId: transportFee.id, dueDate: new Date('2026-07-01'), status: 'overdue' }
  });

  const txS3 = await prisma.transaction.upsert({
    where: { idempotencyKey: 'SEED_S3_TX1' },
    update: {
      studentId: student3.id,
      feeAssignmentId: assignS3Transport.id,
      amount: 5000.00,
      method: 'CHEQUE',
      status: 'pending',
      gatewayRef: 'ORD_S3_TX1'
    },
    create: {
      studentId: student3.id,
      feeAssignmentId: assignS3Transport.id,
      amount: 5000.00,
      method: 'CHEQUE',
      status: 'pending',
      gatewayRef: 'ORD_S3_TX1',
      idempotencyKey: 'SEED_S3_TX1'
    }
  });

  const existingCheque = await prisma.chequeRecord.findFirst({ where: { transactionId: txS3.id } });
  if (!existingCheque) {
    await prisma.chequeRecord.create({
      data: {
        transactionId: txS3.id,
        chequeNo: 'CHQ-001234',
        bank: 'HDFC Bank',
        depositStatus: 'bank_pending'
      }
    });
  }

  // ===== STUDENT 4: Verma Sneha Amit (Grade 7-C, no KYC, tuition pending, waiver pending) =====
  const student4 = await findOrCreateStudent(prisma, {
    guardianId: parent4.id,
    name: 'Verma Sneha Amit',
    class: 'Grade 7-C',
    status: 'active',
    consentChecked: true,
    consentTimestamp: new Date(),
    dob: new Date('2013-05-25'),
    ocrFlagged: false
  });

  const assignS4Tuition = await prisma.feeAssignment.upsert({
    where: { studentId_feeStructureId: { studentId: student4.id, feeStructureId: tuitionFee7C.id } },
    update: { dueDate: new Date('2026-09-01'), status: 'pending' },
    create: { studentId: student4.id, feeStructureId: tuitionFee7C.id, dueDate: new Date('2026-09-01'), status: 'pending' }
  });

  const existingWaiverS4 = await prisma.waiverPenalty.findFirst({
    where: { studentId: student4.id, type: 'waiver' }
  });
  if (!existingWaiverS4) {
    await prisma.waiverPenalty.create({
      data: {
        studentId: student4.id,
        feeAssignmentId: assignS4Tuition.id,
        amount: 5000.00,
        type: 'waiver',
        reason: 'Financial hardship due to medical emergency',
        status: 'pending'
      }
    });
  }

  // ===== STUDENT 5: Sharma Rahul Dev (Grade 4-A, KYC, tuition pending, penalty approved) =====
  const student5 = await findOrCreateStudent(prisma, {
    guardianId: parent5.id,
    name: 'Sharma Rahul Dev',
    class: 'Grade 4-A',
    status: 'active',
    consentChecked: true,
    consentTimestamp: new Date(),
    dob: new Date('2016-07-12'),
    ocrFlagged: false
  });

  await prisma.studentKYC.upsert({
    where: { studentId: student5.id },
    update: {
      docType: 'aadhaar',
      docRef: 'XXXX-XXXX-3456',
      ocrData: { name: 'Sharma Rahul Dev', dob: '2016-07-12' },
      ocrFlagged: false,
      verifiedAt: new Date()
    },
    create: {
      studentId: student5.id,
      docType: 'aadhaar',
      docRef: 'XXXX-XXXX-3456',
      ocrData: { name: 'Sharma Rahul Dev', dob: '2016-07-12' },
      ocrFlagged: false,
      verifiedAt: new Date()
    }
  });

  const assignS5Tuition = await prisma.feeAssignment.upsert({
    where: { studentId_feeStructureId: { studentId: student5.id, feeStructureId: tuitionFee4A.id } },
    update: { dueDate: new Date('2026-09-01'), status: 'pending' },
    create: { studentId: student5.id, feeStructureId: tuitionFee4A.id, dueDate: new Date('2026-09-01'), status: 'pending' }
  });

  const existingPenaltyS5 = await prisma.waiverPenalty.findFirst({
    where: { studentId: student5.id, type: 'penalty' }
  });
  if (!existingPenaltyS5) {
    await prisma.waiverPenalty.create({
      data: {
        studentId: student5.id,
        feeAssignmentId: assignS5Tuition.id,
        amount: 1500.00,
        type: 'penalty',
        reason: 'Late fee payment penalty for Term 1',
        status: 'approved',
        approvedById: admin.id,
        approvedAt: new Date()
      }
    });
  }

  // 12. Update receipt sequence
  await prisma.receiptSequence.upsert({
    where: { year: new Date().getFullYear() },
    update: { nextValue: 3 },
    create: { year: new Date().getFullYear(), nextValue: 3 }
  });

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
