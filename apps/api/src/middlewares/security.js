const crypto = require('crypto');
const { requireConfig } = require('../config/env');

const requestId = (req, res, next) => {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (requireConfig().nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
};

const corsOptions = () => {
  const config = requireConfig();
  return {
    origin: config.nodeEnv === 'production' ? config.frontendUrl : true,
    credentials: true
  };
};

module.exports = {
  requestId,
  securityHeaders,
  corsOptions
};