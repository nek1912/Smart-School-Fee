export default function EmptyState({ title, message }) {
  return (
    <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <h3 style={{ color: 'white', marginBottom: '8px' }}>{title}</h3>
      <p>{message}</p>
    </div>
  );
}