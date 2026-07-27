import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Approvals() {
  const [activeTab, setActiveTab] = useState('ocr'); // 'ocr', 'waivers', 'refunds'

  const [approvals, setApprovals] = useState([]);
  const [waivers, setWaivers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [students, setStudents] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Override form states
  const [overrideStudentId, setOverrideStudentId] = useState(null);
  const [overrideForm, setOverrideForm] = useState({
    name: '',
    class: 'Grade 5-A',
    dob: ''
  });

  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Refund dialog states
  const [refundTxId, setRefundTxId] = useState(null);
  const [refundReason, setRefundReason] = useState('');

  const fetchPending = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/admin/approvals', { headers });
      setApprovals(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch pending approvals.');
    }
  };

  const fetchWaivers = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get('/api/waivers?status=pending', { headers });
      setWaivers(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch pending waivers/penalties.');
    }
  };

  const fetchRefundData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [txRes, studRes] = await Promise.all([
        axios.get('/api/payments/transactions', { headers }),
        axios.get('/api/admin/students', { headers })
      ]);
      setTransactions(txRes.data.filter(t => t.status === 'success' || t.status === 'reversed'));
      setStudents(studRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch transaction or student ledger.');
    }
  };

  useEffect(() => {
    if (activeTab === 'ocr') {
      fetchPending();
    } else if (activeTab === 'waivers') {
      fetchWaivers();
    } else {
      fetchRefundData();
    }
  }, [activeTab]);

  const handleVerifyDirect = async (studentId) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`/api/admin/approvals/${studentId}/verify`, {}, { headers });
      setSuccess('Student KYC verified and marked active successfully!');
      fetchPending();
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenOverride = (student) => {
    setOverrideStudentId(student.id);
    let dobVal = '';
    if (student.dob) {
      try {
        dobVal = new Date(student.dob).toISOString().split('T')[0];
      } catch (e) {
        dobVal = '';
      }
    }
    setOverrideForm({
      name: student.name,
      class: student.class,
      dob: dobVal
    });
    setSuccess(null);
    setError(null);
  };

  const handleCloseOverride = () => {
    setOverrideStudentId(null);
  };

  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`/api/admin/approvals/${overrideStudentId}/override`, overrideForm, { headers });
      setSuccess('Student profile manually corrected and KYC verified successfully!');
      setOverrideStudentId(null);
      fetchPending();
    } catch (err) {
      setError(err.response?.data?.error || 'Override submission failed.');
    } finally {
      setLoading(false);
    }
  };

  // Waiver/Penalty Actions
  const handleApproveWaiver = async (id) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`/api/waivers/${id}/approve`, {}, { headers });
      setSuccess('Waiver/penalty request approved successfully.');
      fetchWaivers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve request.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReject = (id) => {
    setRejectId(id);
    setRejectReason('');
    setSuccess(null);
    setError(null);
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectReason) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`/api/waivers/${rejectId}/reject`, { reason: rejectReason }, { headers });
      setSuccess('Waiver/penalty request rejected.');
      setRejectId(null);
      fetchWaivers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject request.');
    } finally {
      setLoading(false);
    }
  };

  // Refund Actions
  const handleOpenRefund = (id) => {
    setRefundTxId(id);
    setRefundReason('');
    setSuccess(null);
    setError(null);
  };

  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    if (!refundReason) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`/api/refunds`, { transaction_id: refundTxId, reason: refundReason }, { headers });
      setSuccess('Refund reversal processed successfully!');
      setRefundTxId(null);
      fetchRefundData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process refund.');
    } finally {
      setLoading(false);
    }
  };

  const isNameMismatched = (name1, name2) => {
    if (!name1 || !name2) return true;
    return name1.toLowerCase().replace(/[^a-z0-9]/g, '') !== name2.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const isDobMismatched = (dob1, dob2) => {
    if (!dob1 || !dob2) return true;
    try {
      return new Date(dob1).toDateString() !== new Date(dob2).toDateString();
    } catch (e) {
      return true;
    }
  };

  return (
    <div className="layout-stack">
      
      {/* Sub tabs nav */}
      <div className="layout-row" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
        <button
          type="button"
          onClick={() => { setActiveTab('ocr'); setError(null); setSuccess(null); }}
          className={`btn ${activeTab === 'ocr' ? '' : 'btn-secondary'}`}
          style={{ padding: '6px 15px', fontSize: '0.8rem' }}
        >
          OCR Identity Approvals
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('waivers'); setError(null); setSuccess(null); }}
          className={`btn ${activeTab === 'waivers' ? '' : 'btn-secondary'}`}
          style={{ padding: '6px 15px', fontSize: '0.8rem' }}
        >
          Waiver & Penalty Requests
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('refunds'); setError(null); setSuccess(null); }}
          className={`btn ${activeTab === 'refunds' ? '' : 'btn-secondary'}`}
          style={{ padding: '6px 15px', fontSize: '0.8rem' }}
        >
          Refund Processing
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Reject reason popover */}
      {rejectId && (
        <div className="glass-panel" style={{ padding: '20px', background: 'rgba(15,23,42,0.95)' }}>
          <form onSubmit={handleRejectSubmit}>
            <h3 style={{ fontSize: '0.95rem', marginTop: 0, marginBottom: '10px' }}>Provide Rejection Reason</h3>
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejecting waiver/penalty request..."
                required
              />
            </div>
            <div className="layout-row">
              <button type="submit" className="btn btn-error">
                Confirm Reject
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setRejectId(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Refund reason popover */}
      {refundTxId && (
        <div className="glass-panel" style={{ padding: '20px', background: 'rgba(15,23,42,0.95)' }}>
          <form onSubmit={handleRefundSubmit}>
            <h3 style={{ fontSize: '0.95rem', marginTop: 0, marginBottom: '10px' }}>Initiate Refund Reversal</h3>
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Reason for refunding this payment..."
                required
              />
            </div>
            <div className="layout-row">
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Processing Reversal...' : 'Confirm Refund'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setRefundTxId(null)} disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* OCR Tab content */}
      {activeTab === 'ocr' && (
        <div className="glass-panel panel-padded">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '15px' }}>Pending Identity & Document Approvals</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
            Review minor details submitted by parents alongside automated OCR extraction data.
          </p>

          {approvals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              No pending KYC approvals found. All students are currently active.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {approvals.map(student => {
                const kyc = student.kycRecord;
                const nameMismatch = kyc ? isNameMismatched(student.name, kyc.ocrData?.name) : false;
                const dobMismatch = kyc ? isDobMismatched(student.dob, kyc.ocrData?.dob) : false;
                const isOverridingThis = overrideStudentId === student.id;

                return (
                  <div 
                    key={student.id} 
                    className="glass-panel" 
                    style={{ 
                      padding: '24px', 
                      background: 'rgba(255,255,255,0.01)', 
                      border: student.ocrFlagged ? '1px solid rgba(239, 68, 68, 0.15)' : '1px solid var(--glass-border)' 
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '15px' }}>
                      <div style={{ flex: 1, minWidth: '250px' }}>
                        <span className="badge" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', marginBottom: '8px', display: 'inline-block' }}>
                          Student #{student.id} ({student.class})
                        </span>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>{student.name}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <strong>Parent:</strong> {student.guardian?.name} ({student.guardian?.mobile})
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          <strong>Doc Type:</strong> <span style={{ textTransform: 'uppercase' }}>{kyc?.docType}</span> | <strong>Doc Ref (Masked):</strong> {kyc?.docRef || 'None'}
                        </p>
                      </div>

                      {kyc && (
                        <div style={{ flex: 1, minWidth: '250px', background: 'rgba(0,0,0,0.15)', padding: '15px', borderRadius: '8px', fontSize: '0.8rem' }}>
                          <span style={{ fontWeight: 'bold', display: 'block', color: student.ocrFlagged ? 'var(--error)' : 'var(--success)', marginBottom: '8px' }}>
                            {student.ocrFlagged ? '⚠️ AUTOMATED OCR ALERT: MISMATCH DETECTED' : '✅ AUTOMATED OCR: OK'}
                          </span>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div style={{ borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: '10px' }}>
                              <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Form Input:</span>
                              <div style={{ color: nameMismatch ? 'var(--error)' : 'var(--success)' }}>
                                <strong>Name:</strong> {student.name}
                              </div>
                              <div style={{ color: dobMismatch ? 'var(--error)' : 'var(--success)' }}>
                                <strong>DOB:</strong> {student.dob ? new Date(student.dob).toLocaleDateString() : 'N/A'}
                              </div>
                            </div>
                            <div style={{ paddingLeft: '10px' }}>
                              <span style={{ color: 'var(--text-secondary)', display: 'block' }}>OCR Detected:</span>
                              <div style={{ color: nameMismatch ? 'var(--error)' : 'var(--success)' }}>
                                <strong>Name:</strong> {kyc.ocrData?.name || 'N/A'}
                              </div>
                              <div style={{ color: dobMismatch ? 'var(--error)' : 'var(--success)' }}>
                                <strong>DOB:</strong> {kyc.ocrData?.dob ? new Date(kyc.ocrData.dob).toLocaleDateString() : 'N/A'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {!isOverridingThis && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px' }}>
                          <button 
                            className="btn btn-sm"
                            onClick={() => handleVerifyDirect(student.id)}
                            disabled={loading}
                          >
                            Verify & Approve
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ border: '1px dashed var(--secondary)' }}
                            onClick={() => handleOpenOverride(student)}
                            disabled={loading}
                          >
                            Manual Override
                          </button>
                        </div>
                      )}
                    </div>

                    {isOverridingThis && (
                      <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--glass-border)' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', fontWeight: 'bold', display: 'block', marginBottom: '15px' }}>
                          MANUAL CORRECTION OVERRIDE
                        </span>
                        <form onSubmit={handleOverrideSubmit}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                            <div className="form-group">
                              <label className="form-label">Corrected Name</label>
                              <input
                                type="text"
                                required
                                className="form-input"
                                value={overrideForm.name}
                                onChange={(e) => setOverrideForm({ ...overrideForm, name: e.target.value })}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Corrected Class</label>
                              <select
                                className="form-input"
                                value={overrideForm.class}
                                onChange={(e) => setOverrideForm({ ...overrideForm, class: e.target.value })}
                                style={{ background: 'rgba(15, 23, 42, 0.8)' }}
                              >
                                <option value="Grade 1-A">Grade 1-A</option>
                                <option value="Grade 2-C">Grade 2-C</option>
                                <option value="Grade 5-A">Grade 5-A</option>
                                <option value="Grade 10-A">Grade 10-A</option>
                                <option value="Grade 10-B">Grade 10-B</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label className="form-label">Corrected Date of Birth</label>
                              <input
                                type="date"
                                required
                                className="form-input"
                                value={overrideForm.dob}
                                onChange={(e) => setOverrideForm({ ...overrideForm, dob: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="layout-row">
                            <button type="submit" className="btn btn-sm" disabled={loading}>
                              {loading ? 'Submitting Override...' : 'Submit Correction & Approve'}
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCloseOverride}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Waiver Tab content */}
      {activeTab === 'waivers' && (
        <div className="glass-panel panel-padded">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '15px' }}>Waiver & Penalty Requests Approvals</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
            Review pending waiver requests or penalty fee additions submitted by cashier staff.
          </p>

          {waivers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              No pending waiver or penalty approvals found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {waivers.map(record => (
                <div key={record.id} className="glass-panel" style={{ padding: '24px', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                      <span className={`badge ${record.type === 'waiver' ? 'badge-active' : 'badge-flagged'}`} style={{ textTransform: 'uppercase', marginBottom: '8px', display: 'inline-block' }}>
                        {record.type} Request
                      </span>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{record.student.name} ({record.student.class})</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <strong>Component:</strong> {record.feeAssignment?.feeStructure?.name} | <strong>Reason:</strong> {record.reason}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: record.type === 'waiver' ? 'var(--success)' : 'var(--error)' }}>
                        {record.type === 'waiver' ? '-' : '+'} ₹{Number(record.amount).toLocaleString()}
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn"
                          style={{ padding: '8px 16px', fontSize: '0.75rem', background: '#10b981' }}
                          onClick={() => handleApproveWaiver(record.id)}
                          disabled={loading}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '8px 16px', fontSize: '0.75rem', border: '1px solid var(--error)', color: 'var(--error)' }}
                          onClick={() => handleOpenReject(record.id)}
                          disabled={loading}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Refunds Tab content */}
      {activeTab === 'refunds' && (
        <div className="glass-panel panel-padded">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '15px' }}>Refund Processing & Bank Reversals</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
            Process bank reversals for educational fee payments. Stage 2 KYC banking details must be completed by parents prior to refund execution.
          </p>

          {transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              No payments found in ledger database.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px' }}>Receipt No</th>
                    <th style={{ padding: '12px' }}>Student (Class)</th>
                    <th style={{ padding: '12px' }}>Amount</th>
                    <th style={{ padding: '12px' }}>Stage 2 KYC</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => {
                    const studentMatch = students.find(s => s.id === tx.studentId);
                    const hasKyc = studentMatch?.kycRecord?.isBankingComplete;
                    
                    return (
                      <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '12px', fontWeight: '700', fontFamily: 'monospace' }}>
                          {tx.receiptNumber}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <strong>{tx.student.name}</strong> ({tx.student.class})
                        </td>
                        <td style={{ padding: '12px', fontWeight: 700 }}>
                          {tx.status === 'reversed' ? '-' : ''}₹{Number(tx.amount).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span className={`badge ${hasKyc ? 'badge-active' : 'badge-flagged'}`} style={{ fontSize: '0.65rem' }}>
                            {hasKyc ? 'COMPLETE' : 'MISSING DETAILS'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {tx.status === 'reversed' ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--error)', fontStyle: 'italic' }}>
                              Reversed
                            </span>
                          ) : (
                            <button
                              className="btn btn-secondary"
                              style={{ 
                                padding: '6px 12px', 
                                fontSize: '0.75rem', 
                                border: '1px solid var(--error)', 
                                color: 'var(--error)',
                                opacity: hasKyc ? 1 : 0.5 
                              }}
                              onClick={() => handleOpenRefund(tx.id)}
                              disabled={!hasKyc || loading}
                              title={hasKyc ? 'Process refund reversal' : 'Awaiting guardian Stage 2 bank details'}
                            >
                              Refund Reversal
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
