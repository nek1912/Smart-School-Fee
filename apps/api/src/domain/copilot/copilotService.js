const { classifyIntent, INTENTS } = require('./intentClassifier');
const { processQuery: processWithAI } = require('./geminiService');
const analyticsEngine = require('../analytics/analyticsEngine');

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

const formatAnswer = (intent, data) => {
  switch (intent) {
    case INTENTS.TOP_DEFAULTERS: {
      if (!data.length) return 'No defaulters found.';
      const lines = data.slice(0, 5).map((d, i) =>
        `${i + 1}. ${d.student_name || d.name || `Student #${d.student_id}`} — ${formatCurrency(d.pending_amount || d.amount || 0)} (${d.days_overdue || d.days || 0} days overdue)`
      );
      return `Top ${Math.min(data.length, 5)} defaulters:\n${lines.join('\n')}`;
    }
    case INTENTS.TODAY_COLLECTION: {
      const total = data?.today_collections || 0;
      return `Today's collection: ${formatCurrency(total)}`;
    }
    case INTENTS.REVENUE_BREAKDOWN: {
      if (!Array.isArray(data) || !data.length) return 'No revenue data available.';
      const lines = data.map(d => `${d.source || d.category || d.month || 'N/A'}: ${formatCurrency(d.total || d.amount || 0)}`);
      return `Revenue breakdown:\n${lines.join('\n')}`;
    }
    case INTENTS.PENDING_DUES: {
      const total = data?.total_pending || 0;
      return `Total pending dues: ${formatCurrency(total)}`;
    }
    case INTENTS.PAYMENT_METHODS: {
      if (!Array.isArray(data) || !data.length) return 'No payment method data available.';
      const lines = data.map(d => `${d.method}: ${formatCurrency(d.total)}`);
      return `Payment method breakdown:\n${lines.join('\n')}`;
    }
    case INTENTS.COLLECTION_TREND: {
      if (!Array.isArray(data) || !data.length) return 'No collection trend data available.';
      const lines = data.map(d => `${d.month}: ${formatCurrency(d.total)}`);
      return `Collection trend:\n${lines.join('\n')}`;
    }
    case INTENTS.PENDING_WAIVERS: {
      if (!Array.isArray(data) || !data.length) return 'No pending waivers.';
      return `${data.length} pending waiver(s) require approval.`;
    }
    case INTENTS.CHEQUE_RISK: {
      if (!Array.isArray(data) || !data.length) return 'No cheque risk items found.';
      return `${data.length} cheque(s) at risk (pending deposit or clearance).`;
    }
    case INTENTS.CASHIER_PERFORMANCE: {
      if (!Array.isArray(data) || !data.length) return 'No cashier performance data available.';
      const lines = data.map(d => `${d.actor_name}: ${d.collection_count} collections`);
      return `Cashier performance:\n${lines.join('\n')}`;
    }
    case INTENTS.CLASS_WISE_ANALYSIS: {
      if (!Array.isArray(data) || !data.length) return 'No class-wise data available.';
      const lines = data.map(d => `${d.class}: ${d.student_count} students, total ${formatCurrency(d.total_amount)}`);
      return `Class-wise analysis:\n${lines.join('\n')}`;
    }
    default:
      return '';
  }
};

const buildChartPayload = (intent, data) => {
  if (!Array.isArray(data) || !data.length) return null;
  switch (intent) {
    case INTENTS.PAYMENT_METHODS:
      return {
        type: 'pie',
        data: data.map(d => ({ name: d.method, value: d.total }))
      };
    case INTENTS.REVENUE_BREAKDOWN:
      return {
        type: 'bar',
        data: data.map(d => ({ name: d.source || d.category || d.month || 'N/A', value: d.total || d.amount || 0 }))
      };
    case INTENTS.COLLECTION_TREND:
      return {
        type: 'line',
        data: data.map(d => ({ name: d.month, value: d.total }))
      };
    default:
      return null;
  }
};

const buildChartFromFunctionName = (fnName, data) => {
  if (!Array.isArray(data) || !data.length) return null;
  switch (fnName) {
    case 'getPaymentMethodBreakdown':
      return {
        type: 'pie',
        data: data.map(d => ({ name: d.method, value: d.total }))
      };
    case 'getRevenueBreakdown':
      return {
        type: 'bar',
        data: data.map(d => ({ name: d.source || d.category || d.month || 'N/A', value: d.total || d.amount || 0 }))
      };
    case 'getCollectionTrend':
      return {
        type: 'line',
        data: data.map(d => ({ name: d.month, value: d.total }))
      };
    default:
      return null;
  }
};

const processQuery = async (query) => {
  const aiResult = await processWithAI(query);

  if (aiResult) {
    const chart = buildChartFromFunctionName(aiResult.functionName, aiResult.functionResult);
    return {
      answer: aiResult.answer,
      data: aiResult.data,
      chart: chart || aiResult.chart,
      sourceNote: aiResult.sourceNote
    };
  }

  const intent = classifyIntent(query);

  if (intent === INTENTS.UNKNOWN) {
    return {
      answer: 'I can help with: top defaulters, today collection, revenue breakdown, pending dues, payment methods, collection trends, pending waivers, cheque risk, cashier performance, class-wise analysis',
      sourceNote: 'No matching query type found'
    };
  }

  const intentToFn = {
    [INTENTS.TOP_DEFAULTERS]: () => analyticsEngine.getTopDefaulters(10),
    [INTENTS.TODAY_COLLECTION]: () => analyticsEngine.getTodayCollection(),
    [INTENTS.REVENUE_BREAKDOWN]: () => analyticsEngine.getRevenueBreakdown('monthly'),
    [INTENTS.PENDING_DUES]: () => analyticsEngine.getPendingDues(),
    [INTENTS.PAYMENT_METHODS]: () => analyticsEngine.getPaymentMethodBreakdown(),
    [INTENTS.COLLECTION_TREND]: () => analyticsEngine.getCollectionTrend(),
    [INTENTS.PENDING_WAIVERS]: () => analyticsEngine.getPendingWaivers(),
    [INTENTS.CHEQUE_RISK]: () => analyticsEngine.getChequeRisk(),
    [INTENTS.CASHIER_PERFORMANCE]: () => analyticsEngine.getCashierPerformance(),
    [INTENTS.CLASS_WISE_ANALYSIS]: () => analyticsEngine.getClassWiseAnalysis()
  };

  const data = await intentToFn[intent]();
  const answer = formatAnswer(intent, data);
  const chart = buildChartPayload(intent, data);

  return { intent, answer, data, chart, sourceNote: `Data sourced from ${intent} analytics` };
};

module.exports = { processQuery };