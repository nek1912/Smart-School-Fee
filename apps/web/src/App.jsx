import React, { useState, useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import ForgotPassword from './pages/auth/ForgotPassword';
import FeeSetup from './pages/admin/FeeSetup';
import Approvals from './pages/admin/Approvals';
import Payment from './pages/guardian/Payment';
import PaymentSuccess from './pages/guardian/PaymentSuccess';
import Receipts from './pages/guardian/Receipts';
import { api } from './api/client';
import AppShell from './components/layout/AppShell';
import RoleNav from './components/layout/RoleNav';
import StatusBadge from './components/common/StatusBadge';
import EmptyState from './components/common/EmptyState';
import ErrorState from './components/common/ErrorState';

// Cashier & Reconciliation imports
import Collections from './pages/cashier/Collections';
import OfflineQueue from './pages/cashier/OfflineQueue';
import Deposits from './pages/cashier/Deposits';
import Reconciliation from './pages/admin/Reconciliation';
import Dashboard from './pages/admin/Dashboard';
import Reports from './pages/admin/Reports';
import Expenses from './pages/admin/Expenses';
import Timeline from './pages/admin/Timeline';

export default function App() {
  const { user, token, logout, submitConsent, successMessage, error, clearAlerts } = useAuthStore();
  const [page, setPage] = useState('login');

  // Simple Admin-only Cashier Form State
  const [cashierForm, setCashierForm] = useState({ name: '', email: '', mobile: '', password: '' });
  const [cashierMsg, setCashierMsg] = useState(null);
  const [cashierErr, setCashierErr] = useState(null);
  const [cashiersList, setCashiersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [adminTab, setAdminTab] = useState('dashboard');
  const [guardianTab, setGuardianTab] = useState('wards');
  const [cashierTab, setCashierTab] = useState('collect');

  const getLogDetails = (log) => {
    try {
      const after = log.after;
      if (log.action === 'signup') {
        return `Registered ${after?.role || 'user'}: ${after?.name || ''} (${after?.mobile || ''})`;
      }
      if (log.action === 'login') {
        return `User logged in (ID: ${log.actorId})`;
      }
      if (log.action === 'update_consent') {
        const status = after?.consentChecked ? 'Granted' : 'Revoked';
        return `DPDP Consent ${status} for Student #${log.entityId}`;
      }
      if (log.action === 'reset_password') {
        return `Password reset completed for User #${log.entityId}`;
      }
      return `Action on ${log.entity} #${log.entityId || ''}`;
    } catch (err) {
      return 'Activity details logged';
    }
  };

  const fetchCashiers = async () => {
    try {
      const response = await api.get('/admin/cashiers');
      setCashiersList(response.data);
    } catch (err) {
      console.error('Failed to fetch cashiers:', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await api.get('/admin/audit-logs');
      setAuditLogs(response.data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  // Simple Guardian-only Student Consent State
  const [students, setStudents] = useState([]);

  const fetchMyStudents = async () => {
    try {
      const response = await api.get('/guardians/students');
      setStudents(response.data);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    }
  };

  useEffect(() => {
    if (token && user) {
      if (window.location.pathname.includes('/payment/success')) {
        setPage('payment-success');
      } else {
        setPage('dashboard');
      }
      if (user.role === 'admin') {
        fetchCashiers();
        fetchAuditLogs();
      } else if (user.role === 'guardian') {
        fetchMyStudents();
      }
    } else {
      if (page === 'dashboard' || page === 'payment-success') {
        setPage('login');
      }
    }
  }, [token, user]);

  const handleLogout = () => {
    logout();
    setPage('login');
  };

  // Handler for Guardian Toggling Student DPDP Consent
  const handleConsentToggle = async (studentId, checked) => {
    try {
      try {
        await submitConsent(studentId, checked);
        fetchMyStudents();
      } catch (err) {
        console.warn('API Consent submission failed:', err.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handler for Admin creating a Cashier (requires Admin role token)
  const handleCreateCashier = async (e) => {
    e.preventDefault();
    setCashierMsg(null);
    setCashierErr(null);

    try {
      const response = await api.post('/auth/signup', {
        ...cashierForm,
        role: 'cashier'
      });
      setCashierMsg(`Cashier account successfully created for ${response.data.user.name}`);
      setCashierForm({ name: '', email: '', mobile: '', password: '' });
      fetchCashiers();
      fetchAuditLogs();
    } catch (err) {
      setCashierErr(err.response?.data?.error || 'Failed to create cashier.');
    }
  };

  // Navigation router
  const renderPage = () => {
    switch (page) {
      case 'login':
        return <Login onNavigate={setPage} />;
      case 'signup':
        return <Signup onNavigate={setPage} />;
      case 'forgot-password':
        return <ForgotPassword onNavigate={setPage} />;
      case 'payment-success':
        return <PaymentSuccess onNavigate={setPage} />;
      case 'dashboard':
        if (!user) return <Login onNavigate={setPage} />;
        return renderDashboard();
      default:
        return <Login onNavigate={setPage} />;
    }
  };

  const renderDashboard = () => {
    const role = user.role;
    return (
      <AppShell user={user} onLogout={handleLogout}>
        <main className="layout-stack-lg">

          {role === 'guardian' && (
            <div className="layout-stack">
              <RoleNav role={role} activeTab={guardianTab} onChange={setGuardianTab} />

              {guardianTab === 'wards' && (
                <div className="glass-panel" style={{ padding: '40px' }}>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>Your Linked Students (Wards)</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', fontSize: '0.9rem' }}>
                    Under the **Digital Personal Data Protection (DPDP) Act 2023**, you must explicitly consent to the collection and processing of your minor ward's educational and payment data.
                  </p>

                  <div className="layout-stack-md">
                    {students.length === 0 ? (
                      <EmptyState title="No Wards Found" message="No students registered under your guardian account." />
                    ) : (
                      students.map(student => (
                        <div key={student.id} className="glass-panel flex-between glass-panel-sm" style={{ background: 'rgba(15, 23, 42, 0.2)' }}>
                          <div>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{student.name}</h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                              Class: {student.class} | ID: {student.id} | DOB: {student.dob ? new Date(student.dob).toLocaleDateString() : 'N/A'}
                            </p>
                            {student.consentChecked ? (
                              <p style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '8px' }}>
                                ✓ DPDP Consent Recorded: {new Date(student.consentTimestamp).toLocaleString()}
                              </p>
                            ) : (
                              <p style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: '8px' }}>
                                ⚠️ DPDP Consent Required: Please check the box on the right to authorize data processing.
                              </p>
                            )}

                            {student.status === 'pending' && student.ocrFlagged && (
                              <p style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '4px', fontWeight: 500 }}>
                                ⚠️ Document mismatch flagged. Awaiting Administrative verification override.
                              </p>
                            )}
                            {student.status === 'pending' && !student.ocrFlagged && (
                              <p style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '4px' }}>
                                ⏳ Awaiting manual Admin verification approval.
                              </p>
                            )}
                            {student.status === 'active' && (
                              <p style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '4px', fontWeight: 500 }}>
                                ✓ Account verified and fully active.
                              </p>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <StatusBadge status={student.status} />
                            <label className="checkbox-container" style={{ margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={student.consentChecked}
                                onChange={(e) => handleConsentToggle(student.id, e.target.checked)}
                              />
                              <span className="checkmark"></span>
                              <span style={{ fontSize: '0.875rem', color: 'white' }}>Grant DPDP Consent</span>
                            </label>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {guardianTab === 'payment' && <Payment />}

              {guardianTab === 'receipts' && <Receipts />}

            </div>
          )}

          {role === 'admin' && (
            <div className="layout-stack">
              <RoleNav role={role} activeTab={adminTab} onChange={setAdminTab} />

              {adminTab === 'cashiers' && (
                <div className="layout-grid-2">
                  <div className="glass-panel panel-padded">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Register New Cashier</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.875rem' }}>
                      Create secure cashier accounts. Cashiers can receive fee payments but cannot modify structural configurations.
                    </p>

                    {cashierMsg && <div className="alert alert-success">{cashierMsg}</div>}
                    <ErrorState message={cashierErr} />

                    <form onSubmit={handleCreateCashier}>
                      <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input type="text" className="form-input" required value={cashierForm.name} onChange={(e) => setCashierForm({ ...cashierForm, name: e.target.value })} placeholder="Cashier's name" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input type="email" className="form-input" required value={cashierForm.email} onChange={(e) => setCashierForm({ ...cashierForm, email: e.target.value })} placeholder="cashier@school.com" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Mobile Number</label>
                        <input type="tel" className="form-input" required maxLength="10" value={cashierForm.mobile} onChange={(e) => setCashierForm({ ...cashierForm, mobile: e.target.value })} placeholder="10-digit number" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Password</label>
                        <input type="password" className="form-input" required value={cashierForm.password} onChange={(e) => setCashierForm({ ...cashierForm, password: e.target.value })} placeholder="Initial password" />
                      </div>
                      <button type="submit" className="btn" style={{ width: '100%', marginTop: '10px' }}>Create Cashier</button>
                    </form>
                  </div>

                  <div className="layout-stack-lg">
                    <div className="glass-panel panel-compact">
                      <h2 style={{ fontSize: '1.2rem', marginBottom: '15px' }}>Registered Cashier Staff</h2>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.85rem' }}>
                        Showing active cashier staff accounts fetched dynamically from the database.
                      </p>
                      <div className="overflow-table">
                        {cashiersList.length === 0 ? (
                          <EmptyState title="No Cashiers" message="No cashier accounts registered yet." />
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '10px' }}>Name</th>
                                <th style={{ padding: '10px' }}>Email</th>
                                <th style={{ padding: '10px' }}>Mobile</th>
                                <th style={{ padding: '10px' }}>Created By</th>
                                <th style={{ padding: '10px' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cashiersList.map((cashier) => (
                                <tr key={cashier.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                  <td style={{ padding: '10px', fontWeight: 500 }}>{cashier.name}</td>
                                  <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{cashier.email}</td>
                                  <td style={{ padding: '10px' }}>{cashier.mobile}</td>
                                  <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{cashier.createdByName}</td>
                                  <td style={{ padding: '10px' }}><StatusBadge status={cashier.status} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    <div className="glass-panel panel-compact">
                      <h2 style={{ fontSize: '1.2rem', marginBottom: '15px' }}>System Audit Logs (Recent Operations)</h2>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.85rem' }}>
                        Showing mutations tracked in the PostgreSQL `audit_logs` table (read-only for security auditing).
                      </p>
                      <div className="overflow-table">
                        {auditLogs.length === 0 ? (
                          <EmptyState title="No Audit Logs" message="No system logs recorded yet." />
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '10px', width: '15%' }}>Time</th>
                                <th style={{ padding: '10px', width: '20%' }}>Actor & Action</th>
                                <th style={{ padding: '10px', width: '50%' }}>Description</th>
                                <th style={{ padding: '10px', width: '15%', textAlign: 'center' }}>Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {auditLogs.map((log) => {
                                const isExpanded = expandedLogId === log.id;
                                return (
                                  <React.Fragment key={log.id}>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                      <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{new Date(log.createdAt).toLocaleTimeString()}</td>
                                      <td style={{ padding: '10px' }}>
                                        <span className="badge" style={{ fontSize: '0.6rem', padding: '2px 5px', background: 'rgba(255,255,255,0.05)', color: 'white', marginRight: '5px', display: 'inline-block', textTransform: 'capitalize' }}>{log.actorRole}</span>
                                        <code style={{ color: 'var(--secondary)' }}>{log.action}</code>
                                      </td>
                                      <td style={{ padding: '10px', fontWeight: 500 }}>{getLogDetails(log)}</td>
                                      <td style={{ padding: '10px', textAlign: 'center' }}>
                                        <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.65rem', borderRadius: '5px' }} onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                                          {isExpanded ? 'Hide' : 'Inspect'}
                                        </button>
                                      </td>
                                    </tr>
                                    {isExpanded && (
                                      <tr>
                                        <td colSpan="4" style={{ padding: '15px', background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--glass-border)' }}>
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                            <div>
                                              <div style={{ color: 'var(--error)', marginBottom: '5px', fontWeight: 'bold' }}>BEFORE STATE:</div>
                                              <pre style={{ overflowX: 'auto', background: 'rgba(15,23,42,0.8)', padding: '10px', borderRadius: '5px', border: '1px solid rgba(244,63,94,0.2)', maxHeight: '150px' }}>{JSON.stringify(log.before, null, 2) || 'null'}</pre>
                                            </div>
                                            <div>
                                              <div style={{ color: 'var(--success)', marginBottom: '5px', fontWeight: 'bold' }}>AFTER STATE:</div>
                                              <pre style={{ overflowX: 'auto', background: 'rgba(15,23,42,0.8)', padding: '10px', borderRadius: '5px', border: '1px solid rgba(16,185,129,0.2)', maxHeight: '150px' }}>{JSON.stringify(log.after, null, 2) || 'null'}</pre>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {adminTab === 'dashboard' && <Dashboard setAdminTab={setAdminTab} />}
              {adminTab === 'fees' && <FeeSetup />}
              {adminTab === 'approvals' && <Approvals />}
              {adminTab === 'reports' && <Reports />}
              {adminTab === 'reconciliation' && <Reconciliation />}
              {adminTab === 'expenses' && <Expenses />}
              {adminTab === 'timeline' && <Timeline />}

            </div>
          )}

          {role === 'cashier' && (
            <div className="layout-stack">
              <RoleNav role={role} activeTab={cashierTab} onChange={setCashierTab} />

              {cashierTab === 'collect' && <Collections />}
              {cashierTab === 'offline' && <OfflineQueue />}
              {cashierTab === 'deposits' && <Deposits />}
            </div>
          )}

        </main>
      </AppShell>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {renderPage()}
    </div>
  );
}
