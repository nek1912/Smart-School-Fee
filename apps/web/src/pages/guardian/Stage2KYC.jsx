import React, { useState } from 'react';

export default function Stage2KYC({ studentId, onSuccess, onCancel }) {
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [passbookFile, setPassbookFile] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!bankAccount || !ifsc) {
      setError('Please fill in both Bank Account and IFSC fields.');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      // Create passbook URL (fake passbook url for simulation)
      const fakePhotoUrl = passbookFile 
        ? `/uploads/passbook-${studentId}-${Date.now()}.jpg`
        : '/uploads/default-passbook.jpg';

      const res = await fetch('/api/students/kyc/stage2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          student_id: studentId,
          bank_account: bankAccount,
          ifsc,
          passbook_photo_url: fakePhotoUrl
        })
      });

      const data = await res.json();
      if (res.status === 200) {
        setSuccess('Banking details submitted successfully! Stage 2 KYC is complete.');
        if (onSuccess) {
          setTimeout(() => onSuccess(data.kycRecord), 2000);
        }
      } else {
        setError(data.error || 'Failed to submit banking details.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '500px', margin: '20px auto' }} className="glass-panel glass-panel-glow">
      <div style={{ padding: '30px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '10px' }}>Stage 2 KYC: Banking Details</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Under DPDP guidelines, banking details are collected only when a refund is requested. They are encrypted at rest for security.
        </p>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          
          <div className="form-group">
            <label className="form-label">Bank Account Number</label>
            <input
              type="text"
              className="form-input"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="e.g. 123456789012"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">IFSC Code</label>
            <input
              type="text"
              className="form-input"
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value)}
              placeholder="e.g. SBIN0001234"
              required
              maxLength="11"
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Passbook Photo / Cancelled Cheque</label>
            <input
              type="file"
              className="form-input"
              onChange={(e) => setPassbookFile(e.target.files[0])}
              accept="image/*,.pdf"
              style={{ padding: '8px' }}
            />
          </div>

          <div className="layout-row" style={{ marginTop: '20px' }}>
            <button type="submit" className="btn" style={{ flex: 1 }} disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Details'}
            </button>
            {onCancel && (
              <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
                Cancel
              </button>
            )}
          </div>

        </form>
      </div>
    </div>
  );
}
