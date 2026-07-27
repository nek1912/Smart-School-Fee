import React, { useState } from 'react';

export default function Reconciliation() {
  const [csvText, setCsvText] = useState('');
  const [matched, setMatched] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target.result);
    };
    reader.onerror = () => {
      setError('Failed to read file.');
    };
    reader.readAsText(file);
  };

  const handleReconcile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setMatched([]);
    setUnmatched([]);

    if (!csvText.trim()) {
      setError('Please paste CSV text or upload a CSV file.');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reconciliation/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ csvText })
      });

      const data = await res.json();
      if (res.status === 200) {
        setMatched(data.matched);
        setUnmatched(data.unmatched);
        setSuccess(`Reconciliation process finished! Auto-matched ${data.matched.length} deposits. Flagged ${data.unmatched.length} unmatched entries.`);
      } else {
        setError(data.error || 'Reconciliation failed.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="layout-stack-lg">
      
      {/* Upload/Paste Form */}
      <div className="glass-panel panel-compact">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '15px' }}>Bank Statement Reconciliation</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Upload your bank statement spreadsheet or copy-paste CSV records to auto-match deposits with cashier records.
        </p>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleReconcile}>
          
          <div className="form-group">
            <label className="form-label">Upload Statement File (CSV)</label>
            <input
              type="file"
              accept=".csv"
              className="form-input"
              onChange={handleFileUpload}
              style={{ padding: '8px' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Or Paste CSV Data (Format: date,amount)</label>
            <textarea
              className="form-input"
              rows={5}
              placeholder="date,amount&#10;2026-07-18,25000&#10;2026-07-18,65000"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
            />
          </div>

          <button type="submit" className="btn" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Processing Bank Statement...' : 'Reconcile Statement'}
          </button>
        </form>
      </div>

      {/* Results Section */}
      {(matched.length > 0 || unmatched.length > 0) && (
        <div className="layout-grid-2" style={{ alignItems: 'start' }}>
          
          {/* Matched Panel */}
          <div className="glass-panel panel-compact">
            <h3 style={{ fontSize: '1rem', marginTop: 0, color: 'var(--success)', marginBottom: '15px' }}>
              Matched Deposits ({matched.length})
            </h3>
            <div style={{ overflowX: 'auto' }}>
              {matched.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '20px 0' }}>
                  No matches found.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.775rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '8px' }}>Date</th>
                      <th style={{ padding: '8px' }}>Amount</th>
                      <th style={{ padding: '8px' }}>Student</th>
                      <th style={{ padding: '8px' }}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '8px' }}>{row.date}</td>
                        <td style={{ padding: '8px', fontWeight: 600 }}>₹{row.amount.toLocaleString()}</td>
                        <td style={{ padding: '8px' }}>{row.studentName}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace' }}>{row.receiptNumber || 'Pending'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Unmatched Panel */}
          <div className="glass-panel panel-compact">
            <h3 style={{ fontSize: '1rem', marginTop: 0, color: 'var(--error)', marginBottom: '15px' }}>
              Unmatched Statement Rows ({unmatched.length})
            </h3>
            <div style={{ overflowX: 'auto' }}>
              {unmatched.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '20px 0' }}>
                  No unmatched rows! Balance is fully cleared.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.775rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '8px' }}>Date</th>
                      <th style={{ padding: '8px' }}>Amount</th>
                      <th style={{ padding: '8px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatched.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '8px' }}>{row.date}</td>
                        <td style={{ padding: '8px', fontWeight: 600 }}>₹{Number(row.amount).toLocaleString()}</td>
                        <td style={{ padding: '8px' }}>
                          <span className="badge badge-flagged" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                            Unmatched
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
