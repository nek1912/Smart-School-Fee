export default function AppShell({ user, onLogout, children }) {
  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '40px' }}>
      <header className="glass-panel flex-between-wrap" style={{ padding: '20px 40px', marginBottom: '30px', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Smart School Fee Platform</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Logged in as <strong style={{ color: 'white' }}>{user.name}</strong> ({user.role})
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={onLogout}>Log Out</button>
      </header>
      {children}
    </div>
  );
}