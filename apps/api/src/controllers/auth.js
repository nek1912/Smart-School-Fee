const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { requireConfig } = require('../config/env');
const prisma = require('../config/db');
const { logAudit } = require('../middlewares/audit');
const { generateToken } = require('../domain/auth/tokens');
const { signupUser } = require('../domain/auth/signup');
const { authenticateWithPassword, verifyOtpAndGetUser, forgotPasswordOtp, resetUserPassword } = require('../domain/auth/login');
const { ValidationError, NotFoundError } = require('../errors/AppError');

const signup = async (req, res, next) => {
  try {
    const { name, mobile, email, password, role, studentName, studentClass, studentDob } = req.body;
    const result = await signupUser({
      name, mobile, email, password, role, studentName, studentClass, studentDob,
      authHeader: req.headers.authorization
    });
    if (result.exists) {
      return res.status(409).json(result);
    }
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { mobile, password } = req.body;
    const result = await authenticateWithPassword(mobile, password);
    return res.status(200).json({
      message: result.message,
      mobile: result.mobile,
      ...(result.otp && { otp: result.otp })
    });
  } catch (err) {
    next(err);
  }
};

const verifyOTP = async (req, res, next) => {
  try {
    const { mobile, otp } = req.body;
    const user = await verifyOtpAndGetUser(mobile, otp);
    const token = generateToken(user);
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

    return res.status(200).json({ user: userWithoutPassword, token });
  } catch (err) {
    next(err);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { mobile } = req.body;
    const result = await forgotPasswordOtp(mobile);
    return res.status(200).json({
      message: result.message,
      ...(result.mobile ? { mobile: result.mobile } : {}),
      ...(result.otp && { otp: result.otp })
    });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { mobile, otp, newPassword } = req.body;
    await resetUserPassword(mobile, otp, newPassword);
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

const refreshToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    const secret = requireConfig().jwtSecret;
    const decoded = jwt.verify(token, secret, { ignoreExpiration: true });
    const user = await prisma.guardian.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const newToken = generateToken(user);
    return res.json({ token: newToken });
  } catch (err) {
    next(err);
  }
};

const addStudent = async (req, res, next) => {
  try {
    const { name, class: studentClass, dob } = req.body;
    if (!name || !studentClass || !dob) {
      throw new ValidationError('name, class, and dob are required');
    }
    const student = await prisma.student.create({
      data: {
        guardianId: req.user.id,
        name,
        class: studentClass,
        dob: new Date(dob),
        status: 'pending',
        consentChecked: true,
        consentTimestamp: new Date()
      }
    });
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'add_student',
      entity: 'student',
      entityId: student.id,
      before: null,
      after: { id: student.id, name: student.name }
    });
    return res.status(201).json({ student });
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
  createStaff,
  refreshToken,
  addStudent
};
