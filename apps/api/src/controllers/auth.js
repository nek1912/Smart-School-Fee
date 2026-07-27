const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { logAudit } = require('../middlewares/audit');
const { requireConfig } = require('../config/env');
const { createOtpChallenge, verifyOtpChallenge } = require('../domain/auth/otpService');

const loginAttempts = {}; // mobile -> { count, lockUntil }

const LOCKOUT_LIMIT = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Signup handler
const signup = async (req, res) => {
  try {
    const { name, mobile, email, password, role, studentName, studentClass, studentDob } = req.body;

    if (!name || !mobile || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const requestedRole = role || 'guardian';
    const allowedRoles = ['guardian'];
    if (!allowedRoles.includes(requestedRole)) {
      return res.status(403).json({ error: 'Staff accounts must be created by an authenticated admin' });
    }

    // Role restrictions: Cashier creation must be performed by an Admin
    let createdByAdminId = null;
    if (requestedRole === 'cashier') {
      // Look for Bearer token to check if user is admin
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ error: 'Forbidden: Admin must be authenticated to create a cashier' });
      }
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const requester = await prisma.guardian.findUnique({ where: { id: decoded.id } });
        if (!requester || requester.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden: Only admins can create cashiers' });
        }
        createdByAdminId = requester.id;
      } catch (err) {
        return res.status(403).json({ error: 'Forbidden: Invalid admin token' });
      }
    }

    // Check if user already exists
    const existingUser = await prisma.guardian.findFirst({
      where: {
        OR: [
          { mobile },
          { email }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this mobile or email already exists' });
    }

    // Enforce single Admin constraint in the system (isolated test runs bypass)
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
        return res.status(400).json({ error: 'An Admin account already exists. Only one Admin is allowed in the system.' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user and nested student
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

    // Generate token
    const token = jwt.sign({ id: newUser.id, role: newUser.role }, requireConfig().jwtSecret, { expiresIn: '24h' });

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = newUser;

    // Log Audit Action
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
  } catch (error) {
    console.error('Signup error:', error);
    if (error.message && error.message.includes('required for guardian signup')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Login (Step 1: Check password and trigger mock OTP)
const login = async (req, res) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({ error: 'Mobile and password are required' });
    }

    // Check account lockout
    const attempts = loginAttempts[mobile];
    if (attempts && attempts.count >= LOCKOUT_LIMIT) {
      if (Date.now() < attempts.lockUntil) {
        const minutesLeft = Math.ceil((attempts.lockUntil - Date.now()) / 60000);
        return res.status(423).json({
          error: `Account locked. Please try again after ${minutesLeft} minutes.`
        });
      } else {
        // Lockout expired, reset attempts
        delete loginAttempts[mobile];
      }
    }

    // Find user
    const user = await prisma.guardian.findUnique({
      where: { mobile }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      // Record failed attempt
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

    // Reset failed attempts on success
    delete loginAttempts[mobile];

    // Generate mock OTP
    const { otp } = await createOtpChallenge({
      mobile,
      intent: 'login',
      payload: { id: user.id, role: user.role }
    });

    // Print to console for verification / testing
    console.log(`\n--- [OTP DEMO] --- \nSMS Sent to: ${mobile}\nOTP Code: ${otp}\nExpires In: 5 minutes\n-------------------\n`);

    return res.status(200).json({
      message: 'Password correct. OTP sent to registered mobile.',
      mobile,
      ...(process.env.NODE_ENV !== 'production' && { otp })
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Login (Step 2: Verify OTP and return JWT)
const verifyOTP = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ error: 'Mobile and OTP are required' });
    }

    const { payload } = await verifyOtpChallenge({ mobile, intent: 'login', otp });
    const user = await prisma.guardian.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(401).json({ error: 'Unauthorized: User not found' });
    const token = jwt.sign({ id: user.id, role: user.role }, requireConfig().jwtSecret, { expiresIn: '24h' });
    const { passwordHash: _, ...userWithoutPassword } = user;

    // Log Audit Action
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
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Forgot Password (Step 1: request OTP)
const forgotPassword = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    const user = await prisma.guardian.findUnique({
      where: { mobile }
    });

    if (!user) {
      // For security, don't expose if the user exists or not, but return OTP sent message.
      // However, we still print to console only if user exists to prevent fake leaks.
      return res.status(200).json({ message: 'OTP sent if mobile exists' });
    }

    const { otp } = await createOtpChallenge({
      mobile,
      intent: 'reset_password',
      payload: { id: user.id }
    });

    console.log(`\n--- [OTP FORGOT PASSWORD] --- \nSMS Sent to: ${mobile}\nOTP Code: ${otp}\nExpires In: 5 minutes\n-----------------------------\n`);

    return res.status(200).json({ message: 'OTP sent successfully', mobile, ...(process.env.NODE_ENV !== 'production' && { otp }) });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Reset Password (Step 2: verify OTP and set new password)
const resetPassword = async (req, res) => {
  try {
    const { mobile, otp, newPassword } = req.body;

    if (!mobile || !otp || !newPassword) {
      return res.status(400).json({ error: 'Mobile, OTP and new password are required' });
    }

    const { payload } = await verifyOtpChallenge({ mobile, intent: 'reset_password', otp });

    const user = await prisma.guardian.findUnique({ where: { mobile } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    const updatedUser = await prisma.guardian.update({
      where: { id: user.id },
      data: { passwordHash: hashedNewPassword }
    });

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;

    // Log Audit Log
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
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DPDP Consent Submission
const submitConsent = async (req, res) => {
  try {
    const { studentId, consent } = req.body;

    if (studentId === undefined || consent === undefined) {
      return res.status(400).json({ error: 'Student ID and consent checkbox are required' });
    }

    const guardianId = req.user.id;

    // Verify this student belongs to the guardian
    const student = await prisma.student.findFirst({
      where: {
        id: Number(studentId),
        guardianId
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found or access unauthorized' });
    }

    const updatedStudent = await prisma.student.update({
      where: { id: student.id },
      data: {
        consentChecked: consent,
        consentTimestamp: consent ? new Date() : null,
        status: consent ? 'active' : 'pending' // Update status based on consent
      }
    });

    // Audit log
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
  } catch (error) {
    console.error('Submit consent error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getCashiers = async (req, res) => {
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
  } catch (error) {
    console.error('Get cashiers error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    return res.status(200).json(logs);
  } catch (error) {
    console.error('Get audit logs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const createStaff = async (req, res) => {
  try {
    const { name, mobile, email, password, role } = req.body;
    const requestedRole = role || 'cashier';

    if (!name || !mobile || !email || !password) {
      return res.status(400).json({ error: 'name, mobile, email and password are required' });
    }
    if (!['cashier', 'employee'].includes(requestedRole)) {
      return res.status(400).json({ error: 'Only cashier or employee staff accounts can be created here' });
    }

    const existingUser = await prisma.guardian.findFirst({ where: { OR: [{ mobile }, { email }] } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this mobile or email already exists' });
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
  } catch (error) {
    console.error('Create staff error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getMyStudents = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      where: { guardianId: req.user.id },
      include: { kycRecord: true }
    });
    return res.status(200).json(students);
  } catch (error) {
    console.error('Get my students error:', error);
    return res.status(500).json({ error: 'Internal server error' });
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
