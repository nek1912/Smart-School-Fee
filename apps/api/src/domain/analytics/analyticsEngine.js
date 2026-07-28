const prisma = require('../../config/db');
const { AppError } = require('../../errors/AppError');
const { getMetricsData } = require('../dashboard/metrics');
const { getDefaulterData } = require('../dashboard/defaulters');
const { getRevenueData } = require('../dashboard/revenue');
const { getReportData } = require('../dashboard/reports');

const getTodayCollection = async () => {
  try {
    const metrics = await getMetricsData();
    return { today_collections: metrics.today_collections };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to get today collection', 500);
  }
};

const getTopDefaulters = async (limit = 10) => {
  try {
    const defaulters = await getDefaulterData('risk');
    return defaulters.slice(0, limit);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to get top defaulters', 500);
  }
};

const getRevenueBreakdown = async (period = 'monthly') => {
  try {
    const data = await getRevenueData(period);
    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to get revenue breakdown', 500);
  }
};

const getPendingDues = async (classFilter) => {
  try {
    const data = await getReportData(classFilter);
    return { total_pending: data.total_pending, breakdown: data.breakdown };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to get pending dues', 500);
  }
};

const getPaymentMethodBreakdown = async () => {
  try {
    const result = await prisma.transaction.groupBy({
      by: ['method'],
      where: { status: 'success' },
      _sum: { amount: true }
    });
    return result.map(r => ({ method: r.method, total: Number(r._sum.amount || 0) }));
  } catch (error) {
    throw new AppError('Failed to get payment method breakdown', 500);
  }
};

const getCollectionTrend = async () => {
  try {
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfTwoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const transactions = await prisma.transaction.findMany({
      where: {
        status: 'success',
        createdAt: { gte: startOfTwoMonthsAgo }
      },
      select: { amount: true, createdAt: true }
    });

    const monthMap = {};
    transactions.forEach(t => {
      const key = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] || 0) + Number(t.amount);
    });

    return Object.entries(monthMap).map(([month, total]) => ({ month, total }));
  } catch (error) {
    throw new AppError('Failed to get collection trend', 500);
  }
};

const getPendingWaivers = async () => {
  try {
    const waivers = await prisma.waiverPenalty.findMany({
      where: { status: 'pending' },
      include: {
        student: true,
        feeAssignment: { include: { feeStructure: true } }
      }
    });
    return waivers;
  } catch (error) {
    throw new AppError('Failed to get pending waivers', 500);
  }
};

const getChequeRisk = async () => {
  try {
    const records = await prisma.chequeRecord.findMany({
      where: {
        depositStatus: { in: ['deposit_pending', 'bank_pending'] }
      },
      include: {
        transaction: { include: { student: true } }
      }
    });
    return records;
  } catch (error) {
    throw new AppError('Failed to get cheque risk data', 500);
  }
};

const getCashierPerformance = async () => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { action: { contains: 'collect' } },
      select: { actorId: true }
    });

    const countByActor = {};
    logs.forEach(log => {
      if (log.actorId) {
        countByActor[log.actorId] = (countByActor[log.actorId] || 0) + 1;
      }
    });

    const actorIds = Object.keys(countByActor).map(Number);
    const actors = actorIds.length > 0
      ? await prisma.guardian.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true }
        })
      : [];

    const actorMap = {};
    actors.forEach(a => { actorMap[a.id] = a.name; });

    return actorIds.map(id => ({
      actor_id: id,
      actor_name: actorMap[id] || 'Unknown',
      collection_count: countByActor[id]
    }));
  } catch (error) {
    throw new AppError('Failed to get cashier performance', 500);
  }
};

const getClassWiseAnalysis = async () => {
  try {
    const assignments = await prisma.feeAssignment.findMany({
      include: {
        student: { select: { class: true } },
        feeStructure: { select: { amount: true } }
      }
    });

    const classMap = {};
    assignments.forEach(a => {
      const cls = a.student.class;
      if (!classMap[cls]) {
        classMap[cls] = { class: cls, student_count: 0, total_amount: 0 };
      }
      classMap[cls].student_count++;
      classMap[cls].total_amount += Number(a.feeStructure.amount);
    });

    return Object.values(classMap);
  } catch (error) {
    throw new AppError('Failed to get class wise analysis', 500);
  }
};

module.exports = {
  getTodayCollection,
  getTopDefaulters,
  getRevenueBreakdown,
  getPendingDues,
  getPaymentMethodBreakdown,
  getCollectionTrend,
  getPendingWaivers,
  getChequeRisk,
  getCashierPerformance,
  getClassWiseAnalysis
};
