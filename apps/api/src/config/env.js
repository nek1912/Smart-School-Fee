const DEFAULT_DEV_JWT_SECRET = 'dev-only-smart-school-jwt-secret-change-before-production';
const DEFAULT_DEV_ENCRYPTION_KEY = 'dev-only-smart-school-encryption-key-32';

const readEnv = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

const getConfig = () => {
  const nodeEnv = readEnv('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const jwtSecret = readEnv('JWT_SECRET', isProduction ? undefined : DEFAULT_DEV_JWT_SECRET);
  const encryptionKey = readEnv('ENCRYPTION_KEY', isProduction ? undefined : DEFAULT_DEV_ENCRYPTION_KEY);
  const databaseUrl = readEnv('DATABASE_URL');

  if (isProduction && !jwtSecret) {
    throw new Error('JWT_SECRET is required in production');
  }
  if (isProduction && !encryptionKey) {
    throw new Error('ENCRYPTION_KEY is required in production');
  }
  if (encryptionKey && encryptionKey.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return {
    nodeEnv,
    port: Number(readEnv('PORT', '5000')),
    jwtSecret,
    encryptionKey,
    databaseUrl,
    frontendUrl: readEnv('FRONTEND_URL', 'http://localhost:3000')
  };
};

const requireConfig = () => getConfig();

module.exports = {
  getConfig,
  requireConfig
};