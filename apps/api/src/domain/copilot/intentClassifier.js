const INTENTS = {
  TOP_DEFAULTERS: 'TOP_DEFAULTERS',
  TODAY_COLLECTION: 'TODAY_COLLECTION',
  REVENUE_BREAKDOWN: 'REVENUE_BREAKDOWN',
  PENDING_DUES: 'PENDING_DUES',
  PAYMENT_METHODS: 'PAYMENT_METHODS',
  COLLECTION_TREND: 'COLLECTION_TREND',
  PENDING_WAIVERS: 'PENDING_WAIVERS',
  CHEQUE_RISK: 'CHEQUE_RISK',
  CASHIER_PERFORMANCE: 'CASHIER_PERFORMANCE',
  CLASS_WISE_ANALYSIS: 'CLASS_WISE_ANALYSIS',
  UNKNOWN: 'UNKNOWN'
};

const INTENT_KEYWORDS = [
  { intent: INTENTS.COLLECTION_TREND, keywords: ['last month vs', 'compare month', 'collection trend', 'month trend'] },
  { intent: INTENTS.CASHIER_PERFORMANCE, keywords: ['cashier perform', 'top cashier', 'cashier collection', 'who collect'] },
  { intent: INTENTS.CLASS_WISE_ANALYSIS, keywords: ['class wise', 'class analysis', 'each class', 'per class', 'which class'] },
  { intent: INTENTS.TOP_DEFAULTERS, keywords: ['top defaulter', 'highest pending', 'most overdue', 'worst payer'] },
  { intent: INTENTS.REVENUE_BREAKDOWN, keywords: ['revenue breakdown', 'revenue stream', 'income breakdown', 'fee breakdown'] },
  { intent: INTENTS.PAYMENT_METHODS, keywords: ['payment method', 'upi vs cash', 'how pay', 'mode'] },
  { intent: INTENTS.PENDING_WAIVERS, keywords: ['pending waiver', 'waiver request', 'unapproved waiver'] },
  { intent: INTENTS.CHEQUE_RISK, keywords: ['cheque risk', 'bounced cheque', 'cheque pending', 'risky cheque'] },
  { intent: INTENTS.TODAY_COLLECTION, keywords: ['today collection', 'today collect', 'collected today', 'today fee'] },
  { intent: INTENTS.PENDING_DUES, keywords: ['pending due', 'outstanding', 'unpaid fee', 'pending fee', 'due list'] }
];

const classifyIntent = (query) => {
  const lower = query.toLowerCase();
  for (const entry of INTENT_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword)) {
        return entry.intent;
      }
    }
  }
  return INTENTS.UNKNOWN;
};

module.exports = { classifyIntent, INTENTS };