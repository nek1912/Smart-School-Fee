const { redactForAudit } = require('../src/utils/redact');

describe('audit redaction', () => {
  test('redacts sensitive fields recursively', () => {
    const value = redactForAudit({
      password: 'secret',
      token: 'jwt',
      otp: '123456',
      bankAccount: '1234567890',
      nested: { ifsc: 'HDFC0001234', docRef: '123412341234' },
      safe: 'visible'
    });

    expect(value.password).toBe('[REDACTED]');
    expect(value.token).toBe('[REDACTED]');
    expect(value.otp).toBe('[REDACTED]');
    expect(value.bankAccount).toBe('[REDACTED]');
    expect(value.nested.ifsc).toBe('[REDACTED]');
    expect(value.nested.docRef).toBe('[REDACTED]');
    expect(value.safe).toBe('visible');
  });
});