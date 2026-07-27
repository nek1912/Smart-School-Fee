const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'token',
  'authorization',
  'otp',
  'receivedOtp',
  'bankAccount',
  'ifsc',
  'docRef',
  'aadhaar',
  'rawBody',
  'ocrData'
]);

const isSensitiveKey = (key) => SENSITIVE_KEYS.has(String(key));

const redactForAudit = (value) => {
  if (Array.isArray(value)) return value.map(redactForAudit);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((acc, [key, child]) => {
    acc[key] = isSensitiveKey(key) ? '[REDACTED]' : redactForAudit(child);
    return acc;
  }, {});
};

module.exports = {
  redactForAudit
};