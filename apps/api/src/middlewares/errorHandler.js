const { Prisma } = require('@prisma/client');

const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    requestId: req.requestId
  });
};

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return res.status(409).json({
          error: 'A record with this value already exists',
          requestId: req.requestId
        });
      case 'P2025':
        return res.status(404).json({
          error: 'Record not found',
          requestId: req.requestId
        });
      case 'P2021':
        return res.status(500).json({
          error: 'Database schema mismatch — run migrations',
          requestId: req.requestId
        });
      default:
        console.error(`[PrismaError] ${err.code}:`, err.message);
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      error: 'Invalid data provided',
      requestId: req.requestId
    });
  }

  const status = Number(err.statusCode || err.status || 500);
  const message = err.isOperational ? err.message : 'Internal server error';

  if (!err.isOperational) {
    console.error(`[Error] ${req.method} ${req.path}:`, err);
  }

  res.status(status).json({
    error: message,
    requestId: req.requestId
  });
};

module.exports = { notFoundHandler, errorHandler };
