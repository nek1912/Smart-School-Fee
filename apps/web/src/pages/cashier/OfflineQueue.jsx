import React, { useState, useEffect } from 'react';
import { getQueuedPayments, deletePaymentFromQueue, updatePaymentInQueue, clearSyncedPayments } from '../../utils/idb';
import { api, normalizeApiError } from '../../api/client';

const TABS = ['Pending', 'Conflicts', 'Synced'];

const STATUS_CONFIG = {
  synced: { label: 'Synced', color: 'var(--success)' },
  already_synced: { label: 'Already on Server', color: '#60a5fa' },
  already_paid: { label: 'Already Paid', color: '#f59e0b' },
  conflict: { label: 'Conflict', color: '#ef4444' },
  failed: { label: 'Failed', color: '#ef4444' },
  skipped: { label: 'Skipped', color: '#6b7280' }
};

export default function OfflineQueue() {
  const [queue, setQueue] = useState([]);
  const [activeTab, setActiveTab] = useState('Pending');
  const [syncing, setSyncing] = useState(false);
  const [resolving, setResolving] = useState(null);
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

  const pendingItems = queue.filter(item => !item.local_status || item.local_status === 'pending');
  const conflictItems = queue.filter(item => item.local_status === 'conflict');
  const syncedItems = queue.filter(item =>
    ['synced', 'already_synced', 'already_paid', 'failed', 'skipped'].includes(item.local_status)
  );

  const activeItems = activeTab === 'Pending' ? pendingItems
    : activeTab === 'Conflicts' ? conflictItems
    : syncedItems;

  const triggerSync = async () => {
    if (!navigator.onLine) {
      setReport('Cannot sync while offline. Please connect to the internet first.');
      return;
    }
    if (pendingItems.length === 0) {
      setReport('No pending items to sync.');
      return;
    }

    setSyncing(true);
    setReport('');

    try {
      const payments = pendingItems.map(item => ({
        local_id: item.idempotency_key,
        idempotency_key: item.idempotency_key,
        fee_assignment_id: item.fee_assignment_id,
        amount: item.amount,
        method: item.method,
        cheque_no: item.cheque_no,
        bank: item.bank
      }));

      const { data } = await api.post('/payments/offline/sync', { payments });

      for (const result of data.results) {
        await updatePaymentInQueue(result.localId, {
          local_status: result.status,
          transaction_id: result.transactionId,
          receipt_number: result.receiptNumber,
          candidate_transaction_id: result.candidateTransactionId,
          conflict_reason: result.reason,
          conflict_actions: result.actions,
          sync_error: result.error,
          synced_at: new Date().toISOString()
        });
      }

      const counts = data.results.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});

      setReport(
        `Sync completed: ${counts.synced || 0} synced, ${counts.already_synced || 0} already on server, ` +
        `${counts.conflict || 0} conflicts, ${counts.already_paid || 0} already paid, ${counts.failed || 0} failed.`
      );
    } catch (err) {
      setReport(`Sync failed: ${normalizeApiError(err)}`);
    }

    setSyncing(false);
    loadQueue();
  };

  const resolveConflictItem = async (item, action) => {
    setResolving(item.idempotency_key);
    setReport('');

    try {
      const { data } = await api.post('/payments/offline/resolve-conflict', {
        localId: item.idempotency_key,
        action,
        idempotencyKey: item.idempotency_key,
        payment: {
          fee_assignment_id: item.fee_assignment_id,
          amount: item.amount,
          method: item.method,
          cheque_no: item.cheque_no,
          bank: item.bank
        }
      });

      if (data.resolved) {
        if (action === 'skip') {
          await deletePaymentFromQueue(item.idempotency_key);
        } else {
          await updatePaymentInQueue(item.idempotency_key, {
            local_status: 'synced',
            resolved_at: new Date().toISOString()
          });
          await deletePaymentFromQueue(item.idempotency_key);
        }
      }

      setReport(`Conflict resolved: ${action === 'skip' ? 'Skipped duplicate' : 'Kept both payments'}.`);
      loadQueue();
    } catch (err) {
      setReport(`Failed to resolve: ${normalizeApiError(err)}`);
    }

    setResolving(null);
  };

  const clearAllSynced = async () => {
    await clearSyncedPayments();
    loadQueue();
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '30px', color: '#ffffff' }} className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#ffffff' }}>Offline Collections Queue</h2>
        <span style={{
          fontSize: '0.75rem', padding: '4px 10px', borderRadius: '50px',
          background: onlineStatus ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          color: onlineStatus ? 'var(--success)' : 'var(--error)', fontWeight: 600
        }}>
          {onlineStatus ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '20px' }}>
        Queued payments collected while the cashier terminal was disconnected.
        They will auto-sync when connection is restored, or you can trigger a manual sync below.
      </p>

      {report && (
        <div className={`alert ${report.includes('failed') || report.includes('Cannot') ? 'alert-error' : 'alert-success'}`}>
          {report}
        </div>
      )}

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 16px', border: 'none', background: 'transparent',
              color: activeTab === tab ? '#ffffff' : '#94a3b8',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              cursor: 'pointer', fontWeight: activeTab === tab ? 600 : 400, fontSize: '0.85rem'
            }}
          >
            {tab}
            {tab === 'Pending' && pendingItems.length > 0 && (
              <span style={{ marginLeft: '6px', background: 'var(--primary)', color: '#fff', borderRadius: '50%', padding: '1px 6px', fontSize: '0.7rem' }}>
                {pendingItems.length}
              </span>
            )}
            {tab === 'Conflicts' && conflictItems.length > 0 && (
              <span style={{ marginLeft: '6px', background: '#ef4444', color: '#fff', borderRadius: '50%', padding: '1px 6px', fontSize: '0.7rem' }}>
                {conflictItems.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeItems.length === 0 ? (
        <div className="empty-state" style={{ color: '#94a3b8' }}>
          {activeTab === 'Pending' && '\u2713 All collections are in sync. Local queue is empty!'}
          {activeTab === 'Conflicts' && '\u2713 No conflicts detected.'}
          {activeTab === 'Synced' && '\u2713 No synced items.'}
        </div>
      ) : (
        <>
          {activeTab === 'Pending' && (
            <>
              <div className="overflow-table" style={{ marginBottom: '20px' }}>
                <table className="table-base" style={{ fontSize: '0.825rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)', color: '#cbd5e1' }}>
                      <th style={{ padding: '12px' }}>Method</th>
                      <th style={{ padding: '12px' }}>Amount</th>
                      <th style={{ padding: '12px' }}>Details</th>
                      <th style={{ padding: '12px' }}>Time Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingItems.map(item => (
                      <tr key={item.idempotency_key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{item.method}</td>
                        <td style={{ padding: '12px' }}>\u20B9{Number(item.amount).toLocaleString('en-IN')}</td>
                        <td style={{ padding: '12px', color: '#cbd5e1' }}>
                          {item.method === 'CHEQUE'
                            ? `Bank: ${item.bank} (No: ${item.cheque_no})`
                            : 'Cash Collection'}
                        </td>
                        <td style={{ padding: '12px', color: '#cbd5e1' }}>
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={triggerSync} disabled={syncing || !onlineStatus} className="btn w-full">
                {syncing ? 'Synchronizing Payments...' : 'Sync Queued Payments with Server'}
              </button>
            </>
          )}

          {activeTab === 'Conflicts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {conflictItems.map(item => (
                <div key={item.idempotency_key} className="glass-panel" style={{
                  padding: '16px', borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <strong>{item.method}</strong> — \u20B9{Number(item.amount).toLocaleString('en-IN')}
                    </div>
                    <span style={{
                      fontSize: '0.7rem', padding: '2px 8px', borderRadius: '50px',
                      background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 600
                    }}>
                      CONFLICT
                    </span>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '8px' }}>
                    {item.conflict_reason || 'A matching payment was already recorded for today.'}
                  </p>
                  {item.candidate_transaction_id && (
                    <p style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '12px' }}>
                      Existing transaction ID: {item.candidate_transaction_id}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => resolveConflictItem(item, 'keep_both')}
                      disabled={resolving === item.idempotency_key}
                      className="btn"
                      style={{ flex: 1 }}
                    >
                      {resolving === item.idempotency_key ? 'Processing...' : 'Keep Both'}
                    </button>
                    <button
                      onClick={() => resolveConflictItem(item, 'skip')}
                      disabled={resolving === item.idempotency_key}
                      className="btn"
                      style={{
                        flex: 1, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }}
                    >
                      {resolving === item.idempotency_key ? 'Processing...' : 'Skip Duplicate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'Synced' && (
            <>
              <div className="overflow-table" style={{ marginBottom: '20px' }}>
                <table className="table-base" style={{ fontSize: '0.825rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)', color: '#cbd5e1' }}>
                      <th style={{ padding: '12px' }}>Method</th>
                      <th style={{ padding: '12px' }}>Amount</th>
                      <th style={{ padding: '12px' }}>Status</th>
                      <th style={{ padding: '12px' }}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncedItems.map(item => (
                      <tr key={item.idempotency_key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{item.method}</td>
                        <td style={{ padding: '12px' }}>\u20B9{Number(item.amount).toLocaleString('en-IN')}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            fontSize: '0.7rem', padding: '2px 8px', borderRadius: '50px',
                            background: `${(STATUS_CONFIG[item.local_status]?.color || '#6b7280')}22`,
                            color: STATUS_CONFIG[item.local_status]?.color || '#6b7280',
                            fontWeight: 600
                          }}>
                            {STATUS_CONFIG[item.local_status]?.label || item.local_status}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: '#cbd5e1', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {item.receipt_number || '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {syncedItems.length > 0 && (
                <button onClick={clearAllSynced} className="btn w-full" style={{
                  background: 'rgba(107, 114, 128, 0.2)', color: '#94a3b8',
                  border: '1px solid rgba(107, 114, 128, 0.3)'
                }}>
                  Clear Synced Items
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
