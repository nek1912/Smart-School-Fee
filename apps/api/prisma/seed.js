const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with default cashier/admin credentials and E2E records...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Clean existing records in correct dependency order
  await prisma.auditLog.deleteMany({});
  await prisma.maintenanceExpense.deleteMany({});
  await prisma.waiverPenalty.deleteMany({});
  await prisma.receipt.deleteMany({});
  await prisma.chequeRecord.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.feeAssignment.deleteMany({});
  
  // Clean fee structures and academic years before deleting student records
  await prisma.feeStructure.deleteMany({});
  await prisma.academicYear.deleteMany({});
  
  await prisma.studentKYC.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.cashier.deleteMany({});
  await prisma.guardian.deleteMany({});

  console.log('Cleared existing tables.');

  // 2. Create Academic Year
  const ay = await prisma.academicYear.create({
    data: {
      label: 'AY 2026-27',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-04-30'),
      isActive: true
    }
  });

  // 3. Create Fee Structures
  const tuitionFee = await prisma.feeStructure.create({
    data: {
      academicYearId: ay.id,
      name: 'Tuition Fee - Term 1',
      amount: 25000.00,
      type: 'tuition',
      appliesTo: 'Grade 5-A'
    }
  });

  const transportFee = await prisma.feeStructure.create({
    data: {
      academicYearId: ay.id,
      name: 'Transport Fee - Q1',
      amount: 5000.00,
      type: 'transport',
      appliesTo: 'Grade 5-A'
    }
  });

  // 4. Create Admin Guardian
  const admin = await prisma.guardian.create({
    data: {
      name: 'Super Admin',
      mobile: '9265218085',
      email: 'admin@smartschool.com',
      passwordHash,
      role: 'admin'
    }
  });

  // 5. Create Cashier Guardian & Cashier profile
  const cashierUser = await prisma.guardian.create({
    data: {
      name: 'Primary Cashier',
      mobile: '9898989898',
      email: 'cashier@smartschool.com',
      passwordHash,
      role: 'cashier'
    }
  });

  await prisma.cashier.create({
    data: {
      userId: cashierUser.id,
      createdByAdminId: admin.id
    }
  });

  // 6. Create Parent Guardian
  const parent = await prisma.guardian.create({
    data: {
      name: 'Rajeshbhai Ravtode',
      mobile: '9696969696',
      email: 'parent@smartschool.com',
      passwordHash,
      role: 'guardian'
    }
  });

  // 7. Create Student
  const student = await prisma.student.create({
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

  // Create Student KYC
  await prisma.studentKYC.create({
    data: {
      studentId: student.id,
      docType: 'aadhaar',
      docRef: 'XXXX-XXXX-1234',
      ocrData: { name: 'Ravtode Ronak Rajeshbhai', dob: '2015-08-15' },
      ocrFlagged: false,
      verifiedAt: new Date()
    }
  });

  // 8. Assign Fees
  const tuitionAssign = await prisma.feeAssignment.create({
    data: {
      studentId: student.id,
      feeStructureId: tuitionFee.id,
      dueDate: new Date('2026-09-01'),
      status: 'pending'
    }
  });

  const transportAssign = await prisma.feeAssignment.create({
    data: {
      studentId: student.id,
      feeStructureId: transportFee.id,
      dueDate: new Date('2026-07-01'),
      status: 'overdue'
    }
  });

  // 9. Create failed payment logs to simulate AI risk heuristics
  await prisma.transaction.create({
    data: {
      studentId: student.id,
      feeAssignmentId: transportAssign.id,
      amount: 5000.00,
      method: 'UPI',
      status: 'failed',
      gatewayRef: `ORD_FAIL_${Date.now()}_1`,
      idempotencyKey: `FAIL_KEY_${Date.now()}_1`
    }
  });

  await prisma.transaction.create({
    data: {
      studentId: student.id,
      feeAssignmentId: transportAssign.id,
      amount: 5000.00,
      method: 'UPI',
      status: 'failed',
      gatewayRef: `ORD_FAIL_${Date.now()}_2`,
      idempotencyKey: `FAIL_KEY_${Date.now()}_2`
    }
  });

  // 10. Seed receipt sequence for current year
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
