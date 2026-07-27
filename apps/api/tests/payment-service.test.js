describe('payment state guards', () => {
  test('prevents payment on paid assignment', () => {
    const { assertAssignmentPayable } = require('../src/domain/payments/paymentService');
    expect(() => assertAssignmentPayable({ status: 'paid' })).toThrow('Fee component is already paid');
  });

  test('allows pending and overdue assignments', () => {
    const { assertAssignmentPayable } = require('../src/domain/payments/paymentService');
    expect(() => assertAssignmentPayable({ status: 'pending' })).not.toThrow();
    expect(() => assertAssignmentPayable({ status: 'overdue' })).not.toThrow();
  });
});