const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const createOtpChallenge = async ({ mobile, intent, payload = null, tx = prisma }) => {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await tx.otpChallenge.updateMany({
    where: { mobile, intent, consumedAt: null },
    data: { consumedAt: new Date() }
  });

  await tx.otpChallenge.create({
    data: { mobile, intent, payload, otpHash, expiresAt }
  });

  return { otp, expiresAt };
};

const verifyOtpChallenge = async ({ mobile, intent, otp, tx = prisma }) => {
  const challenge = await tx.otpChallenge.findFirst({
    where: { mobile, intent, consumedAt: null },
    orderBy: { createdAt: 'desc' }
  });

  if (!challenge) throw Object.assign(new Error('OTP not requested or expired'), { statusCode: 400 });
  if (challenge.expiresAt < new Date()) {
    await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    throw Object.assign(new Error('OTP expired'), { statusCode: 400 });
  }
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    throw Object.assign(new Error('Too many OTP attempts'), { statusCode: 423 });
  }

  const valid = await bcrypt.compare(otp, challenge.otpHash);
  if (!valid) {
    await tx.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw Object.assign(new Error('Invalid OTP code'), { statusCode: 400 });
  }

  await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  return { payload: challenge.payload || {} };
};

module.exports = {
  createOtpChallenge,
  verifyOtpChallenge
};