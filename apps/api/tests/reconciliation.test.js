describe('reconciliation matcher', () => {
  test('parses date amount reference csv', () => {
    const { parseStatementCsv } = require('../src/domain/reconciliation/matcher');
    const rows = parseStatementCsv('date,amount,reference\n2026-07-27,5000,REC-2026-0001');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].reference).toBe('REC-2026-0001');
  });
});