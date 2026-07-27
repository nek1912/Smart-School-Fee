export default function StatusBadge({ status }) {
  const normalized = String(status || 'unknown').toLowerCase();
  const className = normalized === 'active' || normalized === 'paid' || normalized === 'success'
    ? 'badge badge-active'
    : 'badge badge-pending';
  return <span className={className} style={{ textTransform: 'capitalize' }}>{normalized}</span>;
}