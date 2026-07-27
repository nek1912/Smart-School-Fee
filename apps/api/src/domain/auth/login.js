const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { logAudit } = require('../../middlewares/audit');
const { createOtpChallenge, verifyOtpChallenge } = require('./otpService');
const { AppError, ValidationError, UnauthorizedError, NotFoundError } = require('../../errors/AppError');

const loginAttempts = {};

const LOCKOUT_LIMIT = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

const authenticateWithPassword = async (mobile, password) => {
  if (!mobile || !password) {
    throw new ValidationError('Mobile and password are required');
  }

  const attempts = loginAttempts[mobile];
  if (attempts && attempts.count >= LOCKOUT_LIMIT) {
    if (Date.now() < attempts.lockUntil) {
      const minutesLeft = Math.ceil((attempts.lockUntil - Date.now()) / 60000);
      throw new AppError(`Account locked. Please try again after ${minutesLeft} minutes.`, 423);
    }
    delete loginAttempts[mobile];
  }

  const user = await prisma.guardian.findUnique({ where: { mobile } });
  if (!user) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    if (!loginAttempts[mobile]) {
      loginAttempts[mobile] = { count: 1, lockUntil: 0 };
    } else {
      loginAttempts[mobile].count += 1;
    }

    if (loginAttempts[mobile].count >= LOCKOUT_LIMIT) {
      loginAttempts[mobile].lockUntil = Date.now() + LOCKOUT_DURATION;
      throw new AppError('Too many failed attempts. Account locked for 15 minutes.', 423);
    }

    throw new AppError(
      `Invalid credentials. Attempts remaining: ${LOCKOUT_LIMIT - loginAttempts[mobile].count}`,
      401
    );
  }

  delete loginAttempts[mobile];

  const { otp } = await createOtpChallenge({
    mobile,
    intent: 'login',
    payload: { id: user.id, role: user.role }
  });

  return { message: 'Password correct. OTP sent to registered mobile.', mobile, otp };
};

const verifyOtpAndGetUser = async (mobile, otp) => {
  if (!mobile || !otp) {
    throw new ValidationError('Mobile and OTP are required');
  }

  const { payload } = await verifyOtpChallenge({ mobile, intent: 'login', otp });
  const user = await prisma.guardian.findUnique({ where: { id: payload.id } });
  if (!user) throw new UnauthorizedError('Unauthorized: User not found');
  return user;
};

const forgotPasswordOtp = async (mobile) => {
  if (!mobile) {
    throw new ValidationError('Mobile number is required');
  }

  const user = await prisma.guardian.findUnique({ where: { mobile } });
  if (!user) {
    return { message: 'OTP sent if mobile exists' };
  }

  const { otp } = await createOtpChallenge({
    mobile,
    intent: 'reset_password',
    payload: { id: user.id }
  });

  return { message: 'OTP sent successfully', mobile, otp };
};

const resetUserPassword = async (mobile, otp, newPassword) => {
  if (!mobile || !otp || !newPassword) {
    throw new ValidationError('Mobile, OTP and new password are required');
  }

  await verifyOtpChallenge({ mobile, intent: 'reset_password', otp });

  const user = await prisma.guardian.findUnique({ where: { mobile } });
  if (!user) {
    throw new NotFoundError('User');
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  const updatedUser = await prisma.guardian.update({
    where: { id: user.id },
    data: { passwordHash: hashedNewPassword }
  });

  const { passwordHash: _, ...userWithoutPassword } = updatedUser;

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'reset_password',
    entity: 'guardian',
    entityId: user.id,
    before: { id: user.id },
    after: { id: user.id, passwordUpdated: true }
  });

  return userWithoutPassword;
};

module.exports = {
  authenticateWithPassword,
  verifyOtpAndGetUser,
  forgotPasswordOtp,
  resetUserPassword
};
