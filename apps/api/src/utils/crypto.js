const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'smart_school_secret_encryption_key_2026';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function encrypt(text) {
  if (!text) return null;
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).substring(0, 32));
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return null;
  try {
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).substring(0, 32));
    const textParts = text.split(':');
    if (textParts.length < 3) return text;
    const iv = Buffer.from(textParts.shift(), 'hex');
    const tag = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('Decryption failed, returning original string:', err.message);
    return text;
  }
}

module.exports = {
  encrypt,
  decrypt
};
