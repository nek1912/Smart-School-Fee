describe('receipt number formatting', () => {
  test('formats year and sequence', () => {
    const { formatReceiptNumber } = require('../src/domain/payments/receiptService');
    expect(formatReceiptNumber(2026, 1)).toBe('REC-2026-0001');
    expect(formatReceiptNumber(2026, 42)).toBe('REC-2026-0042');
  });
});