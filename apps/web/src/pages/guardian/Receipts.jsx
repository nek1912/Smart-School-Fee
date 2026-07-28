import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Stage2KYC from './Stage2KYC';

export default function Receipts() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Bank form overlay states
  const [kycStudentId, setKycStudentId] = useState(null);
  const [checkingTx, setCheckingTx] = useState(null);

  const fetchTransactions = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/payments/transactions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTransactions(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load transaction history ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleDownloadReceipt = async (transactionId, receiptNumber) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/payments/receipt?transaction_id=${transactionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const link = document.createElement('a');
      link.href = res.data.receiptUrl;
      link.download = `Receipt-${receiptNumber || 'Payment'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert('Failed to retrieve PDF receipt document.');
    }
  };

  const handleRequestRefund = async (tx) => {
    setError(null);
    setSuccess(null);
    setCheckingTx(tx);

    try {
      const token = localStorage.getItem('token');
      // Query if this student has Stage 2 KYC complete. 
      // We can check this by hitting our list or checking the student details.
      const res = await fetch(`/api/guardians/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const students = await res.json();
      const match = students.find(s => s.id === tx.studentId);

      if (match && match.kycRecord && match.kycRecord.isBankingComplete) {
        setSuccess(`Stage 2 KYC is complete for ${tx.student.name}. Please contact the school admin to process your refund.`);
      } else {
        // Open Stage 2 KYC form
        setKycStudentId(tx.studentId);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to verify Stage 2 KYC status.');
    }
  };

  // Show only successful payments (reversal entries omitted — refund status shown on original)
  const allTxns = transactions;
  const successfulTxns = transactions.filter(t => t.status === 'success');

  return (
    <div className="glass-panel panel-padded">
      <div style={{ marginBottom: '25px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px' }}>
        <h2 style={{ fontSize: '1.5rem' }}>Receipt History & Ledger</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Access your digital billing ledger and download official signed PDF receipts for all educational fee payments.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Stage 2 KYC Overlay */}
      {kycStudentId && (
        <div style={{ marginBottom: '20px' }}>
          <div className="alert alert-error" style={{ marginBottom: '15px' }}>
            ⚠️ Stage 2 KYC (Banking Details) is required to process refunds. Please complete the form below.
          </div>
          <Stage2KYC
            studentId={kycStudentId}
            onSuccess={() => {
              setKycStudentId(null);
              setSuccess('Banking details submitted! Please notify the school administrator to release your refund.');
              fetchTransactions();
            }}
            onCancel={() => setKycStudentId(null)}
          />
        </div>
      )}

      {loading ? (
        <div className="empty-state text-sm" style={{ fontSize: '0.9rem' }}>
          Loading transaction receipts...
        </div>
      ) : successfulTxns.length === 0 ? (
        <div className="empty-state-lg text-sm" style={{ fontSize: '0.9rem' }}>
          No successful payments or receipts found in your history log.
        </div>
      ) : (
        <div className="overflow-table">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '15px' }}>Receipt No</th>
                <th style={{ padding: '15px' }}>Date</th>
                <th style={{ padding: '15px' }}>Student (Ward)</th>
                <th style={{ padding: '15px' }}>Fee Particulars</th>
                <th style={{ padding: '15px' }}>Method</th>
                <th style={{ padding: '15px' }}>Amount</th>
                <th style={{ padding: '15px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const refundedFeeIds = new Set(
                  allTxns
                    .filter(t => t.status === 'reversed')
                    .map(t => t.feeAssignmentId)
                );
                return successfulTxns.map((tx) => {
                  const alreadyRefunded = tx.status === 'success' && refundedFeeIds.has(tx.feeAssignmentId);
                  return (
                    <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '15px', fontWeight: '700', color: alreadyRefunded ? 'var(--error)' : 'var(--secondary)', fontFamily: 'monospace' }}>
                        {tx.receiptNumber}
                      </td>
                      <td style={{ padding: '15px', color: 'var(--text-secondary)' }}>
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '15px', fontWeight: 500 }}>{tx.student.name}</td>
                      <td style={{ padding: '15px', color: 'var(--text-secondary)' }}>
                        {tx.feeAssignment.feeStructure.name}
                      </td>
                      <td style={{ padding: '15px' }}>
                        <span className="badge" style={{ fontSize: '0.65rem', padding: '2px 6px', background: alreadyRefunded ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', color: alreadyRefunded ? 'var(--error)' : 'white' }}>
                          {tx.method}
                        </span>
                      </td>
                      <td style={{ padding: '15px', fontWeight: 700, color: alreadyRefunded ? 'var(--error)' : 'var(--success)' }}>
                        ₹{Math.abs(Number(tx.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '15px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleDownloadReceipt(tx.id, tx.receiptNumber)}
                          >
                            Download PDF
                          </button>
                          {!alreadyRefunded && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ border: '1px solid var(--error)', color: 'var(--error)' }}
                              onClick={() => handleRequestRefund(tx)}
                            >
                              Request Refund
                            </button>
                          )}
                          {alreadyRefunded && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--error)', fontStyle: 'italic', display: 'flex', alignItems: 'center' }}>
                              Refunded
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
