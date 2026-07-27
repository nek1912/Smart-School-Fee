export default function EmptyState({ title, message }) {
  return (
    <div className="glass-panel panel-compact text-center text-secondary">
      <h3 style={{ color: 'white', marginBottom: '8px' }}>{title}</h3>
      <p>{message}</p>
    </div>
  );
}