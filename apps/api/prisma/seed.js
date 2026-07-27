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
