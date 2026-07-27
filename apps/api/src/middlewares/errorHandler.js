const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    requestId: req.requestId
  });
};

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err.statusCode || err.status || 500);
  const expose = status >= 400 && status < 500;
  res.status(status).json({
    error: expose ? err.message : 'Internal server error',
    requestId: req.requestId
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};