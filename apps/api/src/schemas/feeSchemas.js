const { numberField, stringField } = require('../middlewares/validate');

const createFeeStructureSchema = [
  stringField('name', { max: 100 }),
  numberField('amount', { min: 0 }),
  stringField('type', { oneOf: ['tuition', 'transport', 'late_fee', 'other'] }),
  stringField('appliesTo', { max: 50 }),
  numberField('academicYearId', { integer: true, min: 1 })
];

const assignFeeSchema = [
  numberField('studentId', { integer: true, min: 1 }),
  numberField('feeStructureId', { integer: true, min: 1 }),
  stringField('dueDate', { max: 30 })
];

module.exports = {
  createFeeStructureSchema,
  assignFeeSchema
};