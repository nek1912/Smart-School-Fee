const parseStatementCsv = (csvText) => {
  return String(csvText || '')
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map(p => String(p || '').trim());
      const [dateRaw, amountRaw, referenceRaw] = parts;
      const descriptionRaw = parts[3];
      const statementDate = new Date(dateRaw);
      const amount = Number(amountRaw);
      if (Number.isNaN(statementDate.getTime()) || Number.isNaN(amount)) {
        throw Object.assign(new Error(`Invalid statement row: ${line}`), { statusCode: 400 });
      }
      const row = { statementDate, amount, reference: referenceRaw || null };
      if (descriptionRaw !== undefined) {
        row.description = descriptionRaw || null;
      }
      return row;
    });
};

const sameUtcDay = (a, b) => {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return d1.getUTCFullYear() === d2.getUTCFullYear()
    && d1.getUTCMonth() === d2.getUTCMonth()
    && d1.getUTCDate() === d2.getUTCDate();
};

const scoreMatch = (row, transaction) => {
  let score = 0;
  const txAmount = Number(transaction.amount);

  const amountDiff = Math.abs(txAmount - row.amount);
  if (amountDiff < 0.01) {
    score += 40;
  } else if (amountDiff <= 100) {
    score += 30;
  }

  const txDate = transaction.depositedAt || transaction.createdAt;
  if (txDate) {
    const diffMs = Math.abs(new Date(txDate) - new Date(row.statementDate));
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (sameUtcDay(txDate, row.statementDate)) {
      score += 25;
    } else if (diffDays <= 1) {
      score += 20;
    } else if (diffDays <= 3) {
      score += 10;
    } else if (diffDays <= 7) {
      score += 5;
    }
  }

  if (row.reference && transaction.receiptNumber) {
    if (row.reference === transaction.receiptNumber) {
      score += 20;
    } else if (
      transaction.receiptNumber.includes(row.reference)
      || row.reference.includes(transaction.receiptNumber)
    ) {
      score += 10;
    }
  }

  if (row.description && transaction.method) {
    const desc = row.description.toUpperCase();
    const method = transaction.method.toUpperCase();
    if (
      (method === 'UPI' && desc.includes('UPI'))
      || (method === 'CASH' && desc.includes('CASH'))
      || (method === 'CHEQUE' && desc.includes('CHEQUE'))
    ) {
      score += 10;
    }
  }

  if (row.reference && transaction.student?.name) {
    const nameParts = transaction.student.name.toLowerCase().split(/\s+/);
    const refLower = row.reference.toLowerCase();
    if (nameParts.some(part => refLower.includes(part))) {
      score += 5;
    }
  }

  return Math.min(score, 100);
};

const matchStatementRows = ({ rows: rawRows, transactions }) => {
  const rows = rawRows.map((r, i) => ({ ...r, _idx: i }));

  const dupeMap = new Map();
  for (const row of rows) {
    const key = row.reference
      ? `${row.reference}|${row.amount}|${row.statementDate.toISOString()}`
      : null;
    if (key) {
      if (dupeMap.has(key)) row.isDuplicate = true;
      else dupeMap.set(key, row);
    }
  }

  const results = [];
  const positiveRows = [];

  for (const row of rows) {
    if (row.amount < 0) {
      results.push({ row, transaction: null, score: 0, category: 'unmatched' });
    } else {
      positiveRows.push(row);
    }
  }

  const usedTxIds = new Set();
  const handledIdxs = new Set();

  const candidates = [];
  for (const row of positiveRows) {
    for (const tx of transactions) {
      const score = scoreMatch(row, tx);
      if (score >= 60) {
        candidates.push({ row, tx, score, rowIdx: row._idx, txId: tx.id });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  for (const cand of candidates) {
    if (usedTxIds.has(cand.txId)) continue;
    if (handledIdxs.has(cand.rowIdx)) continue;

    usedTxIds.add(cand.txId);
    handledIdxs.add(cand.rowIdx);

    const category = cand.score >= 90 ? 'auto_matched' : 'needs_review';
    results.push({ row: cand.row, transaction: cand.tx, score: cand.score, category });
  }

  for (const row of positiveRows) {
    if (!handledIdxs.has(row._idx)) {
      results.push({ row, transaction: null, score: 0, category: 'unmatched' });
    }
  }

  for (const r of results) delete r.row._idx;

  return results;
};

module.exports = {
  parseStatementCsv,
  sameUtcDay,
  scoreMatch,
  matchStatementRows,
};
