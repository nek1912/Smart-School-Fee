const tabsByRole = {
  admin: [
    ['dashboard', 'Dashboard'],
    ['fees', 'Fees'],
    ['approvals', 'Approvals'],
    ['reports', 'Reports'],
    ['reconciliation', 'Reconciliation'],
    ['expenses', 'Expenses']
  ],
  cashier: [
    ['collect', 'Collect'],
    ['offline', 'Offline Queue'],
    ['deposits', 'Deposits']
  ],
  guardian: [
    ['wards', 'My Wards'],
    ['payment', 'Pay Fees'],
    ['receipts', 'Receipts']
  ]
};

export default function RoleNav({ role, activeTab, onChange }) {
  return (
    <div className="layout-row" style={{ gap: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px' }}>
      {(tabsByRole[role] || []).map(([key, label]) => (
        <button key={key} type="button" className={`btn ${activeTab === key ? '' : 'btn-secondary'}`} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}