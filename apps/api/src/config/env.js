const DEFAULT_DEV_JWT_SECRET = 'dev-only-smart-school-jwt-secret-change-before-production';
const DEFAULT_DEV_ENCRYPTION_KEY = 'dev-only-smart-school-encryption-key-32';

const readEnv = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

const warnEnv = (name) => {
  if (!process.env[name]) {
    console.warn(`[config] WARNING: ${name} is not set — using fallback or disabled`);
  }
};

const getConfig = () => {
  const nodeEnv = readEnv('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const jwtSecret = readEnv('JWT_SECRET', isProduction ? undefined : DEFAULT_DEV_JWT_SECRET);
  const encryptionKey = readEnv('ENCRYPTION_KEY', isProduction ? undefined : DEFAULT_DEV_ENCRYPTION_KEY);
  const databaseUrl = readEnv('DATABASE_URL');
  const frontendUrl = readEnv('FRONTEND_URL', isProduction ? undefined : 'http://localhost:3000');

  if (isProduction && !jwtSecret) {
    throw new Error('JWT_SECRET is required in production');
  }
  if (isProduction && !encryptionKey) {
    throw new Error('ENCRYPTION_KEY is required in production');
  }
  if (isProduction && !frontendUrl) {
    throw new Error('FRONTEND_URL is required in production');
  }
  if (encryptionKey && encryptionKey.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!isProduction) {
    warnEnv('CASHFREE_CLIENT_ID');
    warnEnv('CASHFREE_CLIENT_SECRET');
    warnEnv('CASHFREE_WEBHOOK_SECRET');
  }

  return {
    nodeEnv,
    port: Number(readEnv('PORT', '5000')),
    jwtSecret,
    encryptionKey,
    databaseUrl,
    frontendUrl
  };
};

const requireConfig = () => getConfig();

module.exports = {
  getConfig,
  requireConfig
};