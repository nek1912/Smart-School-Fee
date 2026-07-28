const { processQuery } = require('../domain/copilot/copilotService');
const { ValidationError } = require('../errors/AppError');

const processQueryHandler = async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new ValidationError('Query must be a non-empty string');
    }
    const result = await processQuery(query.trim());
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { processQuery: processQueryHandler };