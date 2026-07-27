import React, { useState, useEffect } from 'react';
import { getQueuedPayments, deletePaymentFromQueue } from '../../utils/idb';

export default function OfflineQueue() {
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState(navigator.onLine);
  const [report, setReport] = useState('');

  const loadQueue = async () => {
    try {
      const items = await getQueuedPayments();
      setQueue(items);
    } catch (err) {
      console.error('Failed to load IndexedDB queue:', err);
    }
  };

  useEffect(() => {
    loadQueue();

    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerSync = async () => {
    if (!navigator.onLine) {
      setReport('Cannot sync while offline. Please connect to the internet first.');
      return;
    }
    if (queue.length === 0) {
      setReport('Queue is empty.');
      return;
    }

    setSyncing(true);
    setReport('');
    let successCount = 0;
    let failCount = 0;

    const token = localStorage.getItem('token');

    for (const payment of queue) {
      try {
        const res = await fetch('/api/payments/offline', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payment)
        });

        if (res.status === 200 || res.status === 201) {
          successCount++;
          // Delete from IndexedDB queue
          await deletePaymentFromQueue(payment.idempotency_key);
        } else {
          failCount++;
        }
      } catch (err) {
        console.error(err);
        failCount++;
      }
    }

    setSyncing(false);
    setReport(`Sync process completed: ${successCount} synced successfully, ${failCount} failed.`);
    // Reload IndexedDB queue
    loadQueue();
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '30px', color: '#ffffff' }} className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#ffffff' }}>Offline Collections Queue</h2>
        <span style={{
          fontSize: '0.75rem',
          padding: '4px 10px',
          borderRadius: '50px',
          background: onlineStatus ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          color: onlineStatus ? 'var(--success)' : 'var(--error)',
          fontWeight: 600
        }}>
          {onlineStatus ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '20px' }}>
        Queued payments collected in cash or cheque while the cashier terminal was disconnected. 
        They will auto-sync when connection is restored, or you can trigger a manual sync below.
      </p>

      {report && (
        <div className={`alert ${report.includes('failed') || report.includes('Cannot') ? 'alert-error' : 'alert-success'}`}>
          {report}
        </div>
      )}

      {queue.length === 0 ? (
        <div className="empty-state" style={{ color: '#94a3b8' }}>
          ✓ All collections are in sync. Local queue is empty!
        </div>
      ) : (
        <>
          <div className="overflow-table" style={{ marginBottom: '20px' }}>
            <table className="table-base" style={{ fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: '#cbd5e1' }}>
                  <th style={{ padding: '12px' }}>Method</th>
                  <th style={{ padding: '12px' }}>Amount</th>
                  <th style={{ padding: '12px' }}>Details</th>
                  <th style={{ padding: '12px' }}>Time Added</th>
                  <th style={{ padding: '12px' }}>Idempotency Key</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => (
                  <tr key={item.idempotency_key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{item.method}</td>
                    <td style={{ padding: '12px' }}>₹{Number(item.amount).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '12px', color: '#cbd5e1' }}>
                      {item.method === 'CHEQUE' 
                        ? `Bank: ${item.bank} (No: ${item.cheque_no})` 
                        : 'Cash Collection'}
                    </td>
                    <td style={{ padding: '12px', color: '#cbd5e1' }}>
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {item.idempotency_key.substring(0, 15)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={triggerSync}
            disabled={syncing || !onlineStatus}
            className="btn w-full"
          >
            {syncing ? 'Synchronizing Payments...' : 'Sync Queued Payments with Server'}
          </button>
        </>
      )}
    </div>
  );
}
