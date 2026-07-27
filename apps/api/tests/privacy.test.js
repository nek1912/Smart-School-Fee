describe('privacy masking', () => {
  test('masks document ref to last four characters', () => {
    const { maskDocumentRef } = require('../src/domain/privacy/masking');
    expect(maskDocumentRef('1234 5678 9012')).toBe('**** **** 9012');
  });

  test('minimizes OCR payload', () => {
    const { minimizeOcrData } = require('../src/domain/privacy/masking');
    expect(minimizeOcrData({ name: 'Asha', dob: '2015-01-01', rawText: 'secret' })).toEqual({ name: 'Asha', dob: '2015-01-01' });
  });
});