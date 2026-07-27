const numberField = (name, options = {}) => (source) => {
  const value = source[name];
  if (value === undefined || value === null || value === '') {
    return options.required === false ? null : `${name} is required`;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${name} must be a number`;
  if (options.integer && !Number.isInteger(numeric)) return `${name} must be an integer`;
  if (options.min !== undefined && numeric < options.min) return `${name} must be at least ${options.min}`;
  return null;
};

const stringField = (name, options = {}) => (source) => {
  const value = source[name];
  if (value === undefined || value === null || value === '') {
    return options.required === false ? null : `${name} is required`;
  }
  if (typeof value !== 'string') return `${name} must be a string`;
  if (options.oneOf && !options.oneOf.includes(value)) return `${name} must be one of: ${options.oneOf.join(', ')}`;
  if (options.max && value.length > options.max) return `${name} must be at most ${options.max} characters`;
  return null;
};

const runValidation = (schema, source) => {
  for (const rule of schema) {
    const error = rule(source);
    if (error) return error;
  }
  return null;
};

const validateBody = (schema) => (req, res, next) => {
  const error = runValidation(schema, req.body || {});
  if (error) return res.status(400).json({ error, requestId: req.requestId });
  next();
};

const validateQuery = (schema) => (req, res, next) => {
  const error = runValidation(schema, req.query || {});
  if (error) return res.status(400).json({ error, requestId: req.requestId });
  next();
};

module.exports = {
  numberField,
  stringField,
  validateBody,
  validateQuery
};