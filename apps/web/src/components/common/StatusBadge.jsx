const STATUS_CLASSES = {
  // Success states
  active: 'badge badge-active',
  paid: 'badge badge-active',
  success: 'badge badge-active',
  completed: 'badge badge-active',
  cleared: 'badge badge-active',
  approved: 'badge badge-active',
  // Warning/pending states
  pending: 'badge badge-pending',
  deposit_pending: 'badge badge-pending',
  bank_pending: 'badge badge-pending',
  // Error/failure states
  bounced: 'badge badge-error',
  reversed: 'badge badge-error',
  overdue: 'badge badge-error',
  failed: 'badge badge-error',
  rejected: 'badge badge-error',
};

export default function StatusBadge({ status }) {
  const normalized = String(status || 'unknown').toLowerCase();
  const className = STATUS_CLASSES[normalized] || 'badge badge-pending';
  return <span className={className} style={{ textTransform: 'capitalize' }}>{normalized}</span>;
}