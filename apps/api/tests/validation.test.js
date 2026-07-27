describe('validation helpers', () => {
  test('numberField accepts positive integers', () => {
    const { numberField } = require('../src/middlewares/validate');
    expect(numberField('feeAssignmentId', { integer: true, min: 1 })({ feeAssignmentId: 10 })).toBeNull();
  });

  test('numberField rejects non-numeric values', () => {
    const { numberField } = require('../src/middlewares/validate');
    expect(numberField('feeAssignmentId', { integer: true, min: 1 })({ feeAssignmentId: 'abc' })).toBe('feeAssignmentId must be a number');
  });
});