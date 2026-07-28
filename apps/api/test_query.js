const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.feeAssignment.findMany({
  where: {},
  include: {
    student: true,
    feeStructure: { include: { academicYear: true } },
    waiverPenalties: true
  }
})
.then(r => console.log('OK: count=' + r.length))
.catch(e => console.log('ERR:', e.message))
.finally(() => p.$disconnect());
