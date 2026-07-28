import React, { useState, useEffect } from 'react';
import axios from 'axios';
import BalanceCard from '../../components/dashboard/BalanceCard';
import RevenueChart from '../../components/dashboard/RevenueChart';
import DefaulterList from '../../components/dashboard/DefaulterList';
import QuickActions from '../../components/dashboard/QuickActions';
import Reports from './Reports';
import { useDashboardQuery } from '../../hooks/useDashboardQuery';
import CopilotPanel from '../../components/common/CopilotPanel';

// React Icons replacement as clean SVGs
const BankIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="21" x2="21" y2="21"></line>
    <rect x="3" y="10" width="18" height="11"></rect>
    <path d="M12 2L2 7h20L12 2z"></path>
    <line x1="7" y1="10" x2="7" y2="21"></line>
    <line x1="12" y1="10" x2="12" y2="21"></line>
    <line x1="17" y1="10" x2="17" y2="21"></line>
  </svg>
);

const CashIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2"></rect>
    <circle cx="12" cy="12" r="2"></circle>
    <line x1="6" y1="12" x2="6" y2="12"></line>
    <line x1="18" y1="12" x2="18" y2="12"></line>
  </svg>
);

const PendingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
);

const CollectionIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);

export default function Dashboard({ setAdminTab }) {
  // Fetch real-time dashboard metrics
  const { data: metrics, loading, refetch } = useDashboardQuery('/api/dashboard/metrics', {}, 5000);

  // States for Quick Action Form Modals
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [waiverAmount, setWaiverAmount] = useState('');
  const [waiverReason, setWaiverReason] = useState('');

  // Alerts
  const [toastMessage, setToastMessage] = useState(null);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);
  const [submittingWaiver, setSubmittingWaiver] = useState(false);

  // Fetch student roster for dropdown
  const loadStudents = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/admin/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudents(res.data);
    } catch (err) {
      console.error('Failed to load students roster:', err);
    }
  };

  // Load fee assignments for selected student
  useEffect(() => {
    if (!selectedStudentId) {
      setAssignments([]);
      return;
    }
    const loadAssignments = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/fees/assignments?studentId=${selectedStudentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Only keep unpaid/overdue assignments
        const unpaid = res.data.filter(a => a.status === 'pending' || a.status === 'overdue');
        setAssignments(unpaid);
      } catch (err) {
        console.error('Failed to load student assignments:', err);
      }
    };
    loadAssignments();
  }, [selectedStudentId]);

  const handleActionClick = (action) => {
    if (action === 'Add Expense') {
      if (setAdminTab) setAdminTab('expenses');
    } else if (action === 'Send Reminder') {
      setToastMessage('Reminder dispatch is not configured yet. Export the defaulter list or open WhatsApp links from the defaulter panel.');
      setTimeout(() => setToastMessage(null), 4000);
    } else if (action === 'Waive Fee') {
      loadStudents();
      setFormError(null);
      setFormSuccess(null);
      setSelectedStudentId('');
      setSelectedAssignmentId('');
      setWaiverAmount('');
      setWaiverReason('');
      setShowWaiverModal(true);
    }
  };

  const handleWaiverSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStudentId || !selectedAssignmentId || !waiverAmount || !waiverReason) {
      setFormError('All fields are required to request a fee waiver.');
      return;
    }
    setSubmittingWaiver(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/waivers', {
        student_id: selectedStudentId,
        fee_assignment_id: selectedAssignmentId,
        amount: waiverAmount,
        type: 'waiver',
        reason: waiverReason
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setFormSuccess('Waiver request submitted successfully for Admin approval!');
      refetch(); // Reload metrics immediately
      setTimeout(() => setShowWaiverModal(false), 2000);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Waiver creation failed.');
    } finally {
      setSubmittingWaiver(false);
    }
  };

  const activeMetrics = metrics || {
    bank_balance: 0,
    in_hand_cash: 0,
    pending_fees: 0,
    today_collections: 0
  };

  return (
    <div className="pastel-gradient-bg layout-stack-lg" style={{ padding: '30px', borderRadius: '20px', position: 'relative' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="alert alert-success" style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          {toastMessage}
        </div>
      )}

      {/* Waive Fee Modal */}
      {showWaiverModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 500
        }}>
          <div className="glass-panel panel-compact" style={{ width: '450px', background: 'rgba(15,23,42,0.95)', color: '#ffffff' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '10px', color: '#ffffff' }}>Request Fee Waiver</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '20px' }}>
              Create a pending waiver request. It must be approved under Pending Approvals.
            </p>

            {formError && <div className="alert alert-error" style={{ fontSize: '0.8rem', padding: '10px' }}>{formError}</div>}
            {formSuccess && <div className="alert alert-success" style={{ fontSize: '0.8rem', padding: '10px' }}>{formSuccess}</div>}

            <form onSubmit={handleWaiverSubmit}>
              <div className="form-group">
                <label className="form-label" style={{ color: '#f8fafc' }}>Select Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="form-input"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                  required
                >
                  <option value="" style={{ color: '#000' }}>-- Choose Student --</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id} style={{ color: '#000' }}>{s.name} ({s.class})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: '#f8fafc' }}>Select Fee Component</label>
                <select
                  value={selectedAssignmentId}
                  onChange={(e) => setSelectedAssignmentId(e.target.value)}
                  className="form-input"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                  required
                  disabled={!selectedStudentId}
                >
                  <option value="" style={{ color: '#000' }}>-- Choose Assignment --</option>
                  {assignments.map(a => (
                    <option key={a.id} value={a.id} style={{ color: '#000' }}>
                      {a.feeStructure.name} (Due: {new Date(a.dueDate).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                {selectedStudentId && assignments.length === 0 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--error)', marginTop: '4px', display: 'block' }}>
                    No pending fee assignments found for this student.
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: '#f8fafc' }}>Waiver Amount (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 1000"
                  className="form-input"
                  value={waiverAmount}
                  onChange={(e) => setWaiverAmount(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: '#f8fafc' }}>Reason / Justification</label>
                <input
                  type="text"
                  placeholder="e.g. Academic scholarship rebate"
                  className="form-input"
                  value={waiverReason}
                  onChange={(e) => setWaiverReason(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                  required
                />
              </div>

              <div className="layout-row" style={{ marginTop: '20px' }}>
                <button type="submit" className="btn" style={{ flex: 1 }} disabled={submittingWaiver || assignments.length === 0}>
                  {submittingWaiver ? 'Submitting...' : 'Submit Request'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowWaiverModal(false)} disabled={submittingWaiver}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Dashboard Top Statistics Row */}
      {loading && !metrics ? (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '20px', fontSize: '0.9rem' }}>
          Loading dashboard metrics...
        </div>
      ) : (
        <div className="dashboard-grid-4">
          <BalanceCard 
            title="Bank Balance" 
            value={activeMetrics.bank_balance} 
            icon={<BankIcon />} 
            color="rgba(99, 102, 241, 0.2)"
          />
          <BalanceCard 
            title="In-Hand Cash" 
            value={activeMetrics.in_hand_cash} 
            icon={<CashIcon />} 
            color="rgba(6, 185, 129, 0.2)"
          />
          <BalanceCard 
            title="Pending Fees" 
            value={activeMetrics.pending_fees} 
            icon={<PendingIcon />} 
            color="rgba(244, 63, 94, 0.2)"
          />
          <BalanceCard 
            title="Today's Collections" 
            value={activeMetrics.today_collections} 
            icon={<CollectionIcon />} 
            color="rgba(245, 158, 11, 0.2)"
          />
        </div>
      )}

      {/* Middle Analytics Row */}
      <div className="dashboard-grid-2">
        
        {/* Recharts Analytics Panel */}
        <div className="frosted-glass-card flex-col" style={{ padding: '30px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 5px 0', color: '#0f172a' }}>
            Revenue Stream Breakdown
          </h2>
          <p style={{ color: '#475569', fontSize: '0.8rem', marginBottom: '20px' }}>
            Visual distribution of collections by fee structure category.
          </p>
          <RevenueChart />
        </div>

        {/* Overdue Accounts Ledger Panel */}
        <div className="frosted-glass-card flex-col" style={{ padding: '30px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 5px 0', color: '#0f172a' }}>
            Outstanding Overdue Ledger
          </h2>
          <p style={{ color: '#475569', fontSize: '0.8rem', marginBottom: '20px' }}>
            Defaulters roster matching overdue fee conditions.
          </p>
          <DefaulterList />
        </div>

      </div>

      {/* Bottom Filter & Report Generator Panel */}
      <Reports />

      {/* Floating Action Trigger Bar */}
      <QuickActions onAction={handleActionClick} />

      {/* AI Copilot FAB */}
      <button
        className="copilot-fab"
        onClick={() => setCopilotOpen(true)}
        title="Open AI Copilot"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <line x1="9" y1="10" x2="15" y2="10" />
        </svg>
      </button>

      {copilotOpen && <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} />}
    </div>
  );
}
