import { useState } from 'react';

function ConfidenceBar({ score }) {
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;
  const color = pct >= 90 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--error)';
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
        <span>Match Confidence</span>
        <span style={{ fontWeight: 600, color }}>{pct}%</span>
      </div>
      <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

export default function ReconciliationReviewDrawer({ item, onClose, onResolve }) {
  const [overrideId, setOverrideId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAction = async (action, extra) => {
    setSubmitting(true);
    try {
      await onResolve({ action, ...extra });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '450px',
      height: '100vh',
      background: 'rgba(15,23,42,0.98)',
      borderLeft: '1px solid var(--glass-border)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      animation: 'slideIn 0.2s ease-out'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 24px',
        borderBottom: '1px solid var(--glass-border)'
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Review Match</h3>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: 'none',
            color: 'var(--text-secondary)',
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {/* Comparison cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          <div className="glass-panel" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px' }}>Bank Entry</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.reference || '—'}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.date}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '6px', color: 'var(--primary)' }}>₹{Number(item.amount || 0).toLocaleString()}</div>
            {item.description && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>{item.description}</div>}
          </div>

          {item.transaction && (
            <div className="glass-panel" style={{ padding: '16px' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px' }}>Matched Transaction</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.transaction.receiptNumber || item.transaction.reference || '—'}</div>
              {item.transaction.studentName && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.transaction.studentName}</div>}
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '6px', color: 'var(--success)' }}>₹{Number(item.transaction.amount || 0).toLocaleString()}</div>
              {item.transaction.date && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>{item.transaction.date}</div>}
            </div>
          )}
        </div>

        {item.bankEntry && !item.transaction && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No matching transaction found in system records.</div>
          </div>
        )}

        <ConfidenceBar score={item.confidence} />

        {item.matchExplanation && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '6px' }}>Match Notes</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>{item.matchExplanation}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{
        padding: '20px 24px',
        borderTop: '1px solid var(--glass-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <button className="btn" style={{ width: '100%' }} disabled={submitting} onClick={() => handleAction('approve')}>
          {submitting ? 'Processing...' : 'Approve Match'}
        </button>
        <button className="btn btn-error" style={{ width: '100%' }} disabled={submitting} onClick={() => handleAction('reject')}>
          Reject Match
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="form-input"
            placeholder="Transaction ID"
            value={overrideId}
            onChange={e => setOverrideId(e.target.value)}
            style={{ flex: 1, fontSize: '0.85rem' }}
          />
          <button className="btn btn-secondary" style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }} disabled={submitting || !overrideId.trim()} onClick={() => handleAction('override', { transactionId: overrideId })}>
            Override
          </button>
        </div>
      </div>
    </div>
  );
}
