const prisma = require('../../config/db');

const CHEQUE_TYPE_MAP = {
  deposit_pending: 'cheque_received',
  bank_pending: 'cheque_deposited',
  cleared: 'cheque_cleared',
  bounced: 'cheque_bounced',
};

async function getStudentTimeline(studentId, { types, from, to, limit = 50, before } = {}) {
  const id = Number(studentId);

  const [
    successTxs,
    reversedTxs,
    chequeRecords,
    feeAssignments,
    waiverPenalties,
    ledgerEntries,
    auditLogs,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: { studentId: id, status: 'success' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transaction.findMany({
      where: { studentId: id, status: 'reversed' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.chequeRecord.findMany({
      where: { transaction: { studentId: id } },
      orderBy: { createdAt: 'desc' },
      include: { transaction: true },
    }),
    prisma.feeAssignment.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      include: { feeStructure: true },
    }),
    prisma.waiverPenalty.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ledgerEntry.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.findMany({
      where: { entity: 'student', entityId: id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const events = [];

  for (const tx of successTxs) {
    events.push({
      id: `payment_${tx.id}`,
      timestamp: tx.createdAt,
      type: 'payment_success',
      title: 'Payment Successful',
      amount: Number(tx.amount),
      status: 'success',
      sourceId: tx.id,
      sourceTable: 'transaction',
      metadata: { method: tx.method, receiptNumber: tx.receiptNumber },
    });
  }

  for (const tx of reversedTxs) {
    events.push({
      id: `payment_failed_${tx.id}`,
      timestamp: tx.createdAt,
      type: 'payment_failed',
      title: 'Payment Reversed',
      amount: Number(tx.amount),
      status: 'reversed',
      sourceId: tx.id,
      sourceTable: 'transaction',
      metadata: { method: tx.method, receiptNumber: tx.receiptNumber },
    });
  }

  for (const cr of chequeRecords) {
    const chequeType = CHEQUE_TYPE_MAP[cr.depositStatus] || 'cheque_received';
    const labels = {
      cheque_received: 'Cheque Received',
      cheque_deposited: 'Cheque Deposited',
      cheque_cleared: 'Cheque Cleared',
      cheque_bounced: 'Cheque Bounced',
    };
    events.push({
      id: `cheque_${cr.id}`,
      timestamp: cr.createdAt,
      type: chequeType,
      title: labels[chequeType] || 'Cheque Update',
      amount: Number(cr.transaction.amount),
      status: cr.depositStatus,
      sourceId: cr.id,
      sourceTable: 'cheque_record',
      metadata: { chequeNo: cr.chequeNo, bank: cr.bank, bounceReason: cr.bounceReason },
    });
  }

  for (const fa of feeAssignments) {
    events.push({
      id: `fee_${fa.id}`,
      timestamp: fa.createdAt,
      type: 'fee_assigned',
      title: 'Fee Assigned',
      amount: Number(fa.feeStructure.amount),
      status: fa.status,
      sourceId: fa.id,
      sourceTable: 'fee_assignment',
      metadata: { feeName: fa.feeStructure.name, dueDate: fa.dueDate },
    });
  }

  for (const wp of waiverPenalties) {
    const isWaiver = wp.type === 'waiver';
    const eventType = isWaiver ? `waiver_${wp.status}` : 'penalty_applied';
    const label = isWaiver
      ? `Waiver ${wp.status.charAt(0).toUpperCase() + wp.status.slice(1)}`
      : 'Penalty Applied';
    events.push({
      id: `wp_${wp.id}`,
      timestamp: wp.createdAt,
      type: eventType,
      title: label,
      amount: Number(wp.amount),
      status: wp.status,
      sourceId: wp.id,
      sourceTable: 'waiver_penalty',
      metadata: { reason: wp.reason, rejectionReason: wp.rejectionReason },
    });
  }

  for (const le of ledgerEntries) {
    events.push({
      id: `ledger_${le.id}`,
      timestamp: le.createdAt,
      type: 'refund',
      title: le.direction === 'credit' ? 'Refund Issued' : 'Ledger Adjustment',
      amount: Number(le.amount),
      status: 'completed',
      sourceId: le.id,
      sourceTable: 'ledger_entry',
      metadata: { direction: le.direction, reference: le.reference, note: le.note },
    });
  }

  for (const al of auditLogs) {
    events.push({
      id: `audit_${al.id}`,
      timestamp: al.createdAt,
      type: 'admin_override',
      title: al.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      amount: null,
      status: 'completed',
      sourceId: al.id,
      sourceTable: 'audit_log',
      metadata: { action: al.action, actorRole: al.actorRole },
    });
  }

  let filtered = events;

  if (types) {
    const typeList = Array.isArray(types) ? types : types.split(',');
    filtered = filtered.filter(e => typeList.includes(e.type));
  }

  if (from) {
    const fromDate = new Date(from);
    filtered = filtered.filter(e => new Date(e.timestamp) >= fromDate);
  }

  if (to) {
    const toDate = new Date(to);
    filtered = filtered.filter(e => new Date(e.timestamp) <= toDate);
  }

  if (before) {
    const beforeDate = new Date(before);
    filtered = filtered.filter(e => new Date(e.timestamp) < beforeDate);
  }

  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const limited = filtered.slice(0, Number(limit) || 50);

  const totalPaid = successTxs.reduce((sum, tx) => sum + Number(tx.amount), 0);

  const pendingFees = feeAssignments.filter(
    fa => fa.status === 'pending' || fa.status === 'overdue'
  );
  const totalPending = pendingFees.reduce(
    (sum, fa) => sum + Number(fa.feeStructure.amount),
    0
  );

  const approvedWaivers = waiverPenalties.filter(
    wp => wp.type === 'waiver' && wp.status === 'approved'
  );
  const totalWaived = approvedWaivers.reduce((sum, wp) => sum + Number(wp.amount), 0);

  const approvedPenalties = waiverPenalties.filter(
    wp => wp.type === 'penalty' && wp.status === 'approved'
  );
  const totalPenalized = approvedPenalties.reduce((sum, wp) => sum + Number(wp.amount), 0);

  const lastPaymentDate =
    successTxs.length > 0 ? successTxs[0].createdAt : null;

  return {
    events: limited,
    summary: {
      totalPaid,
      totalPending,
      totalWaived,
      totalPenalized,
      lastPaymentDate,
    },
  };
}

module.exports = { getStudentTimeline };
