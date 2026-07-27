const maskDocumentRef = (value) => {
  if (!value) return null;
  const clean = String(value).replace(/\s/g, '');
  return clean.length >= 4 ? `**** **** ${clean.slice(-4)}` : '****';
};

const maskMobile = (value) => {
  if (!value) return null;
  const clean = String(value).replace(/\D/g, '');
  return clean.length >= 4 ? `******${clean.slice(-4)}` : '****';
};

const minimizeOcrData = (ocrData) => {
  if (!ocrData || typeof ocrData !== 'object') return {};
  const result = {};
  if (ocrData.name) result.name = String(ocrData.name);
  if (ocrData.dob) result.dob = String(ocrData.dob);
  if (ocrData.confidence !== undefined) result.confidence = Number(ocrData.confidence);
  return result;
};

module.exports = {
  maskDocumentRef,
  maskMobile,
  minimizeOcrData
};