const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { logAudit } = require('../middlewares/audit');
const { requireConfig } = require('../config/env');
const { createOtpChallenge, verifyOtpChallenge } = require('../domain/auth/otpService');
const { AppError, ValidationError, NotFoundError, UnauthorizedError } = require('../errors/AppError');

const loginAttempts = {};

const LOCKOUT_LIMIT = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

const signup = async (req, res, next) => {
  try {
    const { name, mobile, email, password, role, studentName, studentClass, studentDob } = req.body;

    if (!name || !mobile || !email || !password) {
      throw new ValidationError('All fields are required');
    }

    const requestedRole = role || 'guardian';
    const allowedRoles = ['guardian'];
    if (!allowedRoles.includes(requestedRole)) {
      throw new AppError('Staff accounts must be created by an authenticated admin', 403);
    }

    let createdByAdminId = null;
    if (requestedRole === 'cashier') {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Forbidden: Admin must be authenticated to create a cashier', 403);
      }
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, requireConfig().jwtSecret);
        const requester = await prisma.guardian.findUnique({ where: { id: decoded.id } });
        if (!requester || requester.role !== 'admin') {
          throw new AppError('Forbidden: Only admins can create cashiers', 403);
        }
        createdByAdminId = requester.id;
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError('Forbidden: Invalid admin token', 403);
      }
    }

    const existingUser = await prisma.guardian.findFirst({
      where: {
        OR: [
          { mobile },
          { email }
        ]
      }
    });

    if (existingUser) {
      throw new ValidationError('User with this mobile or email already exists');
    }

    if (requestedRole === 'admin' && !mobile.startsWith('999999')) {
      const existingAdmin = await prisma.guardian.findFirst({
        where: {
          role: 'admin',
          NOT: {
            mobile: { startsWith: '999999' }
          }
        }
      });
      if (existingAdmin) {
        throw new ValidationError('An Admin account already exists. Only one Admin is allowed in the system.');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.guardian.create({
        data: {
          name,
          mobile,
          email,
          passwordHash: hashedPassword,
          role: requestedRole
        }
      });

      let student = null;
      if (requestedRole === 'guardian' && studentName) {
        student = await tx.student.create({
          data: {
            guardianId: user.id,
            name: studentName,
            class: studentClass || 'Grade 5-A',
            dob: studentDob ? new Date(studentDob) : new Date(),
            status: 'pending',
            consentChecked: true,
            consentTimestamp: new Date()
          }
        });
      }

      if (requestedRole === 'cashier') {
        await tx.cashier.create({
          data: {
            userId: user.id,
            createdByAdminId: createdByAdminId || user.id,
            status: 'active'
          }
        });
      }

      return { user, student };
    });

    const newUser = result.user;
    const student = result.student;

    const token = jwt.sign({ id: newUser.id, role: newUser.role }, requireConfig().jwtSecret, { expiresIn: '24h' });

    const { passwordHash: _, ...userWithoutPassword } = newUser;

    await logAudit({
      actorId: newUser.id,
      actorRole: newUser.role,
      action: 'signup',
      entity: 'guardian',
      entityId: newUser.id,
      before: null,
      after: { guardian: userWithoutPassword, student }
    });

    return res.status(201).json({
      user: userWithoutPassword,
      token,
      student
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      throw new ValidationError('Mobile and password are required');
    }

    const attempts = loginAttempts[mobile];
    if (attempts && attempts.count >= LOCKOUT_LIMIT) {
      if (Date.now() < attempts.lockUntil) {
        const minutesLeft = Math.ceil((attempts.lockUntil - Date.now()) / 60000);
        return res.status(423).json({
          error: `Account locked. Please try again after ${minutesLeft} minutes.`
        });
      } else {
        delete loginAttempts[mobile];
      }
    }

    const user = await prisma.guardian.findUnique({
      where: { mobile }
    });

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
        return res.status(423).json({
          error: `Too many failed attempts. Account locked for 15 minutes.`
        });
      }

      return res.status(401).json({
        error: `Invalid credentials. Attempts remaining: ${LOCKOUT_LIMIT - loginAttempts[mobile].count}`
      });
    }

    delete loginAttempts[mobile];

    const { otp } = await createOtpChallenge({
      mobile,
      intent: 'login',
      payload: { id: user.id, role: user.role }
    });

    console.log(`\n--- [OTP DEMO] --- \nSMS Sent to: ${mobile}\nOTP Code: ${otp}\nExpires In: 5 minutes\n-------------------\n`);

    return res.status(200).json({
      message: 'Password correct. OTP sent to registered mobile.',
      mobile,
      ...(process.env.NODE_ENV !== 'production' && { otp })
    });
  } catch (err) {
    next(err);
  }
};

const verifyOTP = async (req, res, next) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      throw new ValidationError('Mobile and OTP are required');
    }

    const { payload } = await verifyOtpChallenge({ mobile, intent: 'login', otp });
    const user = await prisma.guardian.findUnique({ where: { id: payload.id } });
    if (!user) throw new UnauthorizedError('Unauthorized: User not found');
    const token = jwt.sign({ id: user.id, role: user.role }, requireConfig().jwtSecret, { expiresIn: '24h' });
    const { passwordHash: _, ...userWithoutPassword } = user;

    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'login',
      entity: 'guardian',
      entityId: user.id,
      before: null,
      after: { id: user.id, role: user.role }
    });

    return res.status(200).json({
      user: userWithoutPassword,
      token
    });
  } catch (err) {
    next(err);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      throw new ValidationError('Mobile number is required');
    }

    const user = await prisma.guardian.findUnique({
      where: { mobile }
    });

    if (!user) {
      return res.status(200).json({ message: 'OTP sent if mobile exists' });
    }

    const { otp } = await createOtpChallenge({
      mobile,
      intent: 'reset_password',
      payload: { id: user.id }
    });

    console.log(`\n--- [OTP FORGOT PASSWORD] --- \nSMS Sent to: ${mobile}\nOTP Code: ${otp}\nExpires In: 5 minutes\n-----------------------------\n`);

    return res.status(200).json({ message: 'OTP sent successfully', mobile, ...(process.env.NODE_ENV !== 'production' && { otp }) });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { mobile, otp, newPassword } = req.body;

    if (!mobile || !otp || !newPassword) {
      throw new ValidationError('Mobile, OTP and new password are required');
    }

    const { payload } = await verifyOtpChallenge({ mobile, intent: 'reset_password', otp });

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

    return res.status(200).json({ message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
};

const submitConsent = async (req, res, next) => {
  try {
    const { studentId, consent } = req.body;

    if (studentId === undefined || consent === undefined) {
      throw new ValidationError('Student ID and consent checkbox are required');
    }

    const guardianId = req.user.id;

    const student = await prisma.student.findFirst({
      where: {
        id: Number(studentId),
        guardianId
      }
    });

    if (!student) {
      throw new NotFoundError('Student');
    }

    const updatedStudent = await prisma.student.update({
      where: { id: student.id },
      data: {
        consentChecked: consent,
        consentTimestamp: consent ? new Date() : null,
        status: consent ? 'active' : 'pending'
      }
    });

    await logAudit({
      actorId: guardianId,
      actorRole: req.user.role,
      action: 'update_consent',
      entity: 'student',
      entityId: student.id,
      before: { id: student.id, consentChecked: student.consentChecked, consentTimestamp: student.consentTimestamp },
      after: { id: updatedStudent.id, consentChecked: updatedStudent.consentChecked, consentTimestamp: updatedStudent.consentTimestamp }
    });

    return res.status(200).json({
      success: true,
      message: 'DPDP consent status recorded successfully',
      student: updatedStudent
    });
  } catch (err) {
    next(err);
  }
};

const getCashiers = async (req, res, next) => {
  try {
    const cashiers = await prisma.cashier.findMany({
      include: {
        user: true,
        createdByAdmin: true
      }
    });

    const formatted = cashiers.map(c => ({
      id: c.id,
      userId: c.userId,
      name: c.user.name,
      email: c.user.email,
      mobile: c.user.mobile,
      status: c.status,
      createdByName: c.createdByAdmin ? c.createdByAdmin.name : 'System',
      createdAt: c.createdAt
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    next(err);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    return res.status(200).json(logs);
  } catch (err) {
    next(err);
  }
};

const createStaff = async (req, res, next) => {
  try {
    const { name, mobile, email, password, role } = req.body;
    const requestedRole = role || 'cashier';

    if (!name || !mobile || !email || !password) {
      throw new ValidationError('name, mobile, email and password are required');
    }
    if (!['cashier', 'employee'].includes(requestedRole)) {
      throw new ValidationError('Only cashier or employee staff accounts can be created here');
    }

    const existingUser = await prisma.guardian.findFirst({ where: { OR: [{ mobile }, { email }] } });
    if (existingUser) {
      throw new ValidationError('User with this mobile or email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const staff = await prisma.$transaction(async (tx) => {
      const user = await tx.guardian.create({
        data: { name, mobile, email, passwordHash, role: requestedRole }
      });
      if (requestedRole === 'cashier') {
        await tx.cashier.create({
          data: { userId: user.id, createdByAdminId: req.user.id, status: 'active' }
        });
      }
      return user;
    });

    const { passwordHash: _, ...safeStaff } = staff;
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'create_staff',
      entity: 'guardian',
      entityId: staff.id,
      before: null,
      after: safeStaff
    });

    return res.status(201).json({ user: safeStaff });
  } catch (err) {
    next(err);
  }
};

const getMyStudents = async (req, res, next) => {
  try {
    const students = await prisma.student.findMany({
      where: { guardianId: req.user.id },
      include: { kycRecord: true }
    });
    return res.status(200).json(students);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  signup,
  login,
  verifyOTP,
  forgotPassword,
  resetPassword,
  submitConsent,
  getCashiers,
  getAuditLogs,
  getMyStudents,
  createStaff
};
