describe('offline sync result shape', () => {
  test('normalizes empty batch', async () => {
    const { syncOfflinePayments } = require('../src/domain/payments/offlineSyncService');
    const result = await syncOfflinePayments({ payments: [], actorId: 1, actorRole: 'cashier' });
    expect(result).toEqual({ results: [] });
  });
});