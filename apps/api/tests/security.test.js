describe('environment security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('production rejects missing JWT_SECRET', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/smart_school';
    expect(() => require('../src/config/env').requireConfig()).toThrow('JWT_SECRET is required in production');
  });

  test('production rejects short encryption key', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-production-secret-with-at-least-32-characters';
    process.env.ENCRYPTION_KEY = 'short';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/smart_school';
    expect(() => require('../src/config/env').requireConfig()).toThrow('ENCRYPTION_KEY must be at least 32 characters');
  });

  test('development supplies explicit safe defaults', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_KEY;
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/smart_school';
    const config = require('../src/config/env').requireConfig();
    expect(config.jwtSecret).toBe('dev-only-smart-school-jwt-secret-change-before-production');
    expect(config.encryptionKey).toBe('dev-only-smart-school-encryption-key-32');
  });
});