describe('upi mock guard', () => {
  test('production does not allow mock verify promotion', () => {
    const { canAutoPromoteMockPayment } = require('../src/controllers/payments');
    expect(canAutoPromoteMockPayment('production')).toBe(false);
    expect(canAutoPromoteMockPayment('development')).toBe(true);
  });
});