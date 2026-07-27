const fs = require('fs');
const path = require('path');

const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');

describe('financial schema rules', () => {
  test('contains receipt sequence and ledger models', () => {
    expect(schema).toContain('model ReceiptSequence');
    expect(schema).toContain('model LedgerEntry');
    expect(schema).toContain('@@unique([year])');
  });

  test('contains duplicate prevention constraints', () => {
    expect(schema).toContain('@@unique([studentId, feeStructureId])');
    expect(schema).toContain('@unique @map("idempotency_key")');
  });
});