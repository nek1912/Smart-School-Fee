const prisma = require('../config/db');
const { getMetricsData } = require('../domain/dashboard/metrics');
const { getRevenueData } = require('../domain/dashboard/revenue');
const { getDefaulterData } = require('../domain/dashboard/defaulters');
const { getReportData } = require('../domain/dashboard/reports');

const getMetrics = async (req, res, next) => {
  try {
    const data = await getMetricsData();
    return res.status(200).json(data);
  } catch (err) { next(err); }
};

const getRevenueBreakdown = async (req, res, next) => {
  try {
    const { period = 'monthly', class: classFilter } = req.query;
    const data = await getRevenueData(period, classFilter);
    return res.status(200).json(data);
  } catch (err) { next(err); }
};

const getDefaulters = async (req, res, next) => {
  try {
    const { sort_by = 'days', filter_class } = req.query;
    const data = await getDefaulterData(sort_by, filter_class);
    return res.status(200).json(data);
  } catch (err) { next(err); }
};

const getReports = async (req, res, next) => {
  try {
    const { class: classFilter, start_date, end_date } = req.query;
    const data = await getReportData(classFilter, start_date, end_date);
    return res.status(200).json(data);
  } catch (err) { next(err); }
};

module.exports = { getMetrics, getRevenueBreakdown, getDefaulters, getReports };
