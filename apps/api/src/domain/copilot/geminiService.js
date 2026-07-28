const Groq = require('groq-sdk');
const analyticsEngine = require('../analytics/analyticsEngine');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getTopDefaulters',
      description: 'Get students with highest pending fee amounts (defaulters) sorted by risk level',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Number of defaulters to return (max 20)', default: 10 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getTodayCollection',
      description: 'Get total fee collection amount collected today',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getRevenueBreakdown',
      description: 'Get revenue breakdown by period (monthly or yearly)',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'Period for breakdown: monthly or yearly', enum: ['monthly', 'yearly'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getPendingDues',
      description: 'Get total pending dues amount across all students',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getPaymentMethodBreakdown',
      description: 'Get payment breakdown by method (UPI, CASH, CHEQUE) with totals',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCollectionTrend',
      description: 'Get monthly collection trend data for last 3 months',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getPendingWaivers',
      description: 'Get all pending fee waiver/penalty requests awaiting admin approval',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getChequeRisk',
      description: 'Get cheque records at risk (pending deposit or bank clearance)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCashierPerformance',
      description: 'Get cashier collection performance stats from audit logs',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getClassWiseAnalysis',
      description: 'Get fee analysis grouped by class/grade showing student count and total fee',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchStudents',
      description: 'Search for students by name (partial match). Returns student details including class, guardian, pending fees, and recent payments',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Student name or partial name to search for' }
        },
        required: ['name']
      }
    }
  }
];

const FUNCTION_MAP = {
  getTopDefaulters: (args) => analyticsEngine.getTopDefaulters(args?.limit || 10),
  getTodayCollection: () => analyticsEngine.getTodayCollection(),
  getRevenueBreakdown: (args) => analyticsEngine.getRevenueBreakdown(args?.period || 'monthly'),
  getPendingDues: () => analyticsEngine.getPendingDues(),
  getPaymentMethodBreakdown: () => analyticsEngine.getPaymentMethodBreakdown(),
  getCollectionTrend: () => analyticsEngine.getCollectionTrend(),
  getPendingWaivers: () => analyticsEngine.getPendingWaivers(),
  getChequeRisk: () => analyticsEngine.getChequeRisk(),
  getCashierPerformance: () => analyticsEngine.getCashierPerformance(),
  getClassWiseAnalysis: () => analyticsEngine.getClassWiseAnalysis(),
  searchStudents: (args) => analyticsEngine.searchStudents(args?.name || '')
};

const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];

const SYSTEM_PROMPT = `You are a school fee management AI assistant for Smart School. Your ONLY source of truth is the database.

CRITICAL RULES:
1. You MUST call a database function for EVERY query. Never answer from general knowledge.
2. For student name queries like "details of X", "search Y", "info about Z" — ALWAYS call searchStudents(name).
3. For fee/collection/revenue questions — ALWAYS call the most specific matching function.
4. Format currency in Indian Rupees (₹) with Indian formatting (e.g. ₹1,23,456).
5. Respond conversationally in clear English. Use bullet points for lists.
6. If you're unsure which function to use, call searchStudents for names, or getPendingDues/getTopDefaulters as a fallback.
7. Never say "I cannot look into the database" — you have functions that query it. Always use them.`;

async function tryModel(modelName, apiKey, query) {
  const groq = new Groq({ apiKey });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: query }
  ];

  const response = await groq.chat.completions.create({
    model: modelName,
    messages,
    tools: TOOLS,
    tool_choice: 'required',
    temperature: 0.1,
    max_tokens: 1024
  });

  const choice = response.choices[0];
  const message = choice.message;

  const toolCall = message.tool_calls[0];
  const fnName = toolCall.function.name;
  const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
  const fn = FUNCTION_MAP[fnName];

  if (!fn) {
    return {
      answer: `I don't have access to the "${fnName}" data source.`,
      data: null,
      chart: null,
      sourceNote: null
    };
  }

  let fnResult;
  try {
    fnResult = await fn(fnArgs);
  } catch (err) {
    return {
      answer: `Sorry, I encountered an error fetching ${fnName} data from the database.`,
      data: null,
      chart: null,
      sourceNote: null
    };
  }

  const fnResultJson = JSON.parse(JSON.stringify(fnResult));

  messages.push(message);
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify(fnResultJson)
  });

  const response2 = await groq.chat.completions.create({
    model: modelName,
    messages,
    tools: TOOLS,
    temperature: 0.1,
    max_tokens: 1024
  });

  const finalAnswer = response2.choices[0].message.content || '';

  return {
    answer: finalAnswer,
    data: fnResultJson,
    chart: null,
    functionName: fnName,
    functionResult: fnResultJson,
    sourceNote: 'Verified from school database'
  };
}

async function processQuery(query) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  let lastError = null;
  for (const modelName of MODELS) {
    try {
      return await tryModel(modelName, apiKey, query);
    } catch (err) {
      lastError = err;
      console.warn(`[AI] Model ${modelName} failed:`, err.message);
    }
  }

  console.error('[AI] All models failed:', lastError?.message);
  return {
    answer: 'AI service unavailable. Please check your GROQ_API_KEY in .env',
    data: null,
    chart: null,
    sourceNote: null
  };
}

module.exports = { processQuery };