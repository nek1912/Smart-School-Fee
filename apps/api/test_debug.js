const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query', 'info', 'warn', 'error'] });

async function main() {
  try {
    const whereClause = { studentId: 1 };
    const assignments = await prisma.feeAssignment.findMany({
      where: whereClause,
      include: {
        student: true,
        feeStructure: { include: { academicYear: true } },
        waiverPenalties: true
      },
      orderBy: { dueDate: 'asc' }
    });
    console.log('OK:', assignments.length);
    for (const a of assignments) {
      console.log('  id:', a.id, 'studentId:', a.studentId, 'feeStructureId:', a.feeStructureId, 'status:', a.status);
    }
  } catch (e) {
    console.log('ERROR:', e.message);
    console.log(e);
  }
  await prisma.$disconnect();
}

main();
