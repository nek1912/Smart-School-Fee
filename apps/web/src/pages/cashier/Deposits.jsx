import React, { useState, useEffect } from 'react';

export default function Deposits() {
  const [cheques, setCheques] = useState([]);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [bounceReason, setBounceReason] = useState('');
  const [bouncingId, setBouncingId] = useState(null);

  const fetchCheques = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/cheques', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.status === 200) {
        setCheques(data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch cheque records.');
    }
  };

  useEffect(() => {
    fetchCheques();
  }, []);

  const handleDeposit = async (id) => {
    setLoadingId(id);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cheques/${id}/deposit`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 200) {
        setSuccess('Cheque marked as deposited at the bank.');
        fetchCheques();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to deposit cheque.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error occurred.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleClear = async (id) => {
    setLoadingId(id);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cheques/${id}/clear`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 200) {
        setSuccess('Cheque successfully cleared! Receipt has been generated.');
        fetchCheques();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to clear cheque.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error occurred.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleBounceSubmit = async (e) => {
    e.preventDefault();
    if (!bouncingId) return;

    setLoadingId(bouncingId);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cheques/${bouncingId}/bounce`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ bounce_reason: bounceReason })
      });
      if (res.status === 200) {
        setSuccess('Cheque marked as bounced. Reopened fee assignment and applied ₹500 penalty.');
        setBounceReason('');
        setBouncingId(null);
        fetchCheques();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to bounce cheque.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error occurred.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '30px', color: '#ffffff' }} className="glass-panel">
      <h2 style={{ fontSize: '1.25rem', marginBottom: '15px', color: '#ffffff' }}>Cheque Lifecycle Manager</h2>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '25px' }}>
        View registered cheques, submit them for clearing at the bank, and process bounces.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Bounce Dialog Overlay Form */}
      {bouncingId && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid var(--glass-border)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
          color: '#ffffff'
        }}>
          <form onSubmit={handleBounceSubmit}>
            <h3 style={{ fontSize: '1rem', marginTop: 0, color: '#ffffff' }}>Report Cheque Bounce</h3>
            <div className="form-group">
              <label className="form-label">Reason for Bounce</label>
              <input
                type="text"
                className="form-input"
                value={bounceReason}
                onChange={(e) => setBounceReason(e.target.value)}
                placeholder="e.g. Insufficient funds, signature mismatch"
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-error" style={{ background: 'var(--error)' }}>
                Confirm Bounce & Apply Penalty (₹500)
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setBouncingId(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-table">
        {cheques.length === 0 ? (
          <div className="empty-state" style={{ color: '#cbd5e1' }}>
            No cheques registered in the system.
          </div>
        ) : (
          <table className="table-base" style={{ fontSize: '0.825rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: '#cbd5e1' }}>
                <th style={{ padding: '12px' }}>Student</th>
                <th style={{ padding: '12px' }}>Bank</th>
                <th style={{ padding: '12px' }}>Cheque No.</th>
                <th style={{ padding: '12px' }}>Amount</th>
                <th style={{ padding: '12px' }}>Deposit Status</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cheques.map(cheque => (
                <tr key={cheque.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '12px', fontWeight: 500 }}>
                    {cheque.transaction.student.name}
                  </td>
                  <td style={{ padding: '12px' }}>{cheque.bank}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace' }}>{cheque.chequeNo}</td>
                  <td style={{ padding: '12px' }}>₹{Number(cheque.transaction.amount).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '12px' }}>
                    <span className={`badge ${
                      cheque.depositStatus === 'cleared' ? 'badge-active' :
                      cheque.depositStatus === 'bounced' ? 'badge-flagged' :
                      'badge-pending'
                    }`} style={{ textTransform: 'capitalize' }}>
                      {cheque.depositStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      
                      {cheque.depositStatus === 'deposit_pending' && (
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                          disabled={loadingId !== null}
                          onClick={() => handleDeposit(cheque.id)}
                        >
                          Mark Deposited
                        </button>
                      )}

                      {cheque.depositStatus === 'bank_pending' && (
                        <>
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: '0.7rem', background: '#10b981' }}
                            disabled={loadingId !== null}
                            onClick={() => handleClear(cheque.id)}
                          >
                            Clear
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: '0.7rem', background: '#ef4444' }}
                            disabled={loadingId !== null}
                            onClick={() => setBouncingId(cheque.id)}
                          >
                            Bounce
                          </button>
                        </>
                      )}

                      {cheque.depositStatus === 'cleared' && (
                        <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>Completed</span>
                      )}
                      {cheque.depositStatus === 'bounced' && (
                        <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>Bounced</span>
                      )}

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
