const { numberField, stringField } = require('../middlewares/validate');

const initiatePaymentSchema = [
  numberField('feeAssignmentId', { integer: true, min: 1 }),
  stringField('method', { oneOf: ['UPI'] }),
  stringField('idempotencyKey', { max: 100 })
];

const collectManualSchema = [
  numberField('feeAssignmentId', { integer: true, min: 1 }),
  stringField('method', { oneOf: ['CASH', 'CHEQUE'] }),
  stringField('idempotencyKey', { max: 100 })
];

const collectOfflineSchema = [
  numberField('fee_assignment_id', { integer: true, min: 1 }),
  stringField('method', { oneOf: ['CASH', 'CHEQUE'] }),
  stringField('idempotency_key', { max: 100 })
];

module.exports = {
  initiatePaymentSchema,
  collectManualSchema,
  collectOfflineSchema
};