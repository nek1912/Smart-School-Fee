const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { logAudit } = require('../../middlewares/audit');
const { generateToken, verifyToken } = require('./tokens');
const { AppError, ValidationError } = require('../../errors/AppError');

const signupUser = async (data) => {
  const { name, mobile, email, password, role, studentName, studentClass, studentDob, authHeader } = data;

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
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Forbidden: Admin must be authenticated to create a cashier', 403);
    }
    try {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
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
    where: { OR: [{ mobile }, { email }] }
  });

  if (existingUser) {
    return { exists: true, message: 'An account with this mobile or email already exists. Please log in or add a new ward from your dashboard.' };
  }

  if (requestedRole === 'admin' && !mobile.startsWith('999999')) {
    const existingAdmin = await prisma.guardian.findFirst({
      where: {
        role: 'admin',
        NOT: { mobile: { startsWith: '999999' } }
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

  const token = generateToken(newUser);

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

  return { user: userWithoutPassword, token, student };
};

module.exports = { signupUser };
