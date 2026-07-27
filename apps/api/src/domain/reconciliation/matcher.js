const parseStatementCsv = (csvText) => {
  return String(csvText || '')
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [dateRaw, amountRaw, referenceRaw] = line.split(',').map(part => String(part || '').trim());
      const statementDate = new Date(dateRaw);
      const amount = Number(amountRaw);
      if (Number.isNaN(statementDate.getTime()) || Number.isNaN(amount)) {
        throw Object.assign(new Error(`Invalid statement row: ${line}`), { statusCode: 400 });
      }
      return { statementDate, amount, reference: referenceRaw || null };
    });
};

const sameUtcDay = (a, b) => {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return d1.getUTCFullYear() === d2.getUTCFullYear()
    && d1.getUTCMonth() === d2.getUTCMonth()
    && d1.getUTCDate() === d2.getUTCDate();
};

const matchStatementRows = ({ rows, transactions }) => {
  const used = new Set();
  const matched = [];
  const unmatched = [];

  for (const row of rows) {
    const tx = transactions.find(candidate => {
      if (used.has(candidate.id)) return false;
      const amountMatches = Math.abs(Number(candidate.amount) - row.amount) < 0.01;
      const dateMatches = candidate.depositedAt && sameUtcDay(candidate.depositedAt, row.statementDate);
      const referenceMatches = row.reference && candidate.receiptNumber === row.reference;
      return amountMatches && (referenceMatches || dateMatches);
    });

    if (tx) {
      used.add(tx.id);
      matched.push({ row, transaction: tx });
    } else {
      unmatched.push({ row, reason: 'No deposited transaction matched by amount and date/reference' });
    }
  }

  return { matched, unmatched };
};

module.exports = {
  parseStatementCsv,
  matchStatementRows
};