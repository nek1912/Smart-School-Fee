const prisma = require('../config/db');
const { ValidationError } = require('../errors/AppError');

const ALLOWED_CATEGORIES = ['watchman', 'cleaning', 'utilities', 'repairs', 'other'];

const createExpense = async (req, res, next) => {
  try {
    const { description, amount, date, category } = req.body;
    const adminId = req.user.id;

    if (!description || !amount || !date || !category) {
      throw new ValidationError('All fields are required: description, amount, date, category');
    }

    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw new ValidationError(`Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`);
    }

    const expense = await prisma.maintenanceExpense.create({
      data: {
        description,
        amount: Number(amount),
        date: new Date(date),
        category,
        createdById: adminId
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: req.user.role,
        action: 'create_expense',
        entity: 'maintenance_expense',
        entityId: expense.id,
        before: null,
        after: expense
      }
    });

    return res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
};

const getExpenses = async (req, res, next) => {
  try {
    const expenses = await prisma.maintenanceExpense.findMany({
      include: {
        createdBy: {
          select: { name: true, email: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    return res.status(200).json(expenses);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createExpense,
  getExpenses
};
