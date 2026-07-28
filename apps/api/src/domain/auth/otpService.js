const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const smsService = require('../../services/smsService');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const generateOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

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

  // Send OTP via SMS
  try {
    await smsService.sendOtp(mobile, otp);
    console.log(`OTP sent successfully to ${mobile}`);
  } catch (error) {
    console.error(`Failed to send OTP to ${mobile}:`, error.message);
    throw new Error('Failed to send OTP. Please try again.');
  }

  // Return OTP in mock mode for development
  const isMock = process.env.SMS_PROVIDER === 'mock' || process.env.SMS_ENABLED === 'false';
  return { expiresAt, otp: isMock ? otp : undefined };
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