import { useState, useEffect, useCallback } from 'react';
import { api, normalizeApiError } from '../../api/client';
import ReconciliationReviewDrawer from '../../components/common/ReconciliationReviewDrawer';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

const STATUS_OPTIONS = ['All', 'auto_matched', 'needs_review', 'unmatched', 'matched', 'rejected'];

const STATUS_LABELS = {
  auto_matched: 'Auto-Matched',
  needs_review: 'Needs Review',
  unmatched: 'Unmatched',
  matched: 'Matched',
  rejected: 'Rejected'
};

const BADGE_CLASS = {
  auto_matched: 'badge badge-active',
  matched: 'badge badge-active',
  needs_review: 'badge badge-pending',
  unmatched: 'badge badge-flagged',
  rejected: 'badge badge-flagged'
};

function confidenceColor(score) {
  if (score == null) return 'var(--text-secondary)';
  if (score >= 90) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--error)';
}

function confidenceBg(score) {
  if (score == null) return 'transparent';
  if (score >= 90) return 'rgba(16,185,129,0.15)';
  if (score >= 60) return 'rgba(245,158,11,0.15)';
  return 'rgba(244,63,94,0.15)';
}

function StatCard({ label, value, color }) {
  return (
    <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function Skeleton({ width, height, borderRadius }) {
  return (
    <div style={{
      width: width || '100%',
      height: height || '16px',
      borderRadius: borderRadius || '8px',
      background: 'rgba(255,255,255,0.06)',
      animation: 'pulse 1.5s infinite'
    }} />
  );
}

export default function Reconciliation() {
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [batchHistory, setBatchHistory] = useState([]);
  const [drawerItem, setDrawerItem] = useState(null);
  const [batchId, setBatchId] = useState(null);
  const [csvText, setCsvText] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get('/reconciliation/history');
      setBatchHistory(res.data.batches || res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filtered = items.filter(item => {
    const matchesSearch = !searchTerm ||
      (item.reference && item.reference.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: items.length,
    autoMatched: items.filter(i => i.status === 'auto_matched').length,
    needsReview: items.filter(i => i.status === 'needs_review').length,
    unmatched: items.filter(i => i.status === 'unmatched').length
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(i => i.id)));
  };

  const toggleItem = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleUpload = async () => {
    if (!csvText.trim()) {
      setError('Please paste CSV text before uploading');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post('/reconciliation/upload', { csvText });
      const data = res.data;
      const batchRes = await api.get(`/reconciliation/${data.batchId}`);
      setItems(batchRes.data.data?.items || batchRes.data.items || []);
      setBatchId(data.batchId);
      setSuccess(data.summary
        ? `Batch processed: ${data.summary.totalRows} rows (${data.summary.autoMatched} auto-matched)`
        : 'Batch processed successfully');
      await loadHistory();
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    setError(null);
    try {
      await api.post('/reconciliation/bulk-action', {
        itemIds: Array.from(selectedIds),
        action
      });
      const res = await api.get(`/reconciliation/${batchId}`);
      const data = res.data.data || res.data;
      setItems(data.items || []);
      setSelectedIds(new Set());
      setSuccess(`${action === 'approve' ? 'Approved' : 'Rejected'} ${selectedIds.size} item(s)`);
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleResolve = async (itemId, resolution) => {
    try {
      await api.put(`/reconciliation/item/${itemId}`, resolution);
      const res = await api.get(`/reconciliation/${batchId}`);
      const data = res.data.data || res.data;
      setItems(data.items || []);
      setDrawerItem(null);
      setSuccess('Item resolved');
    } catch (err) {
      setError(normalizeApiError(err));
    }
  };

  const openDrawer = (item) => {
    setDrawerItem(item);
  };

  return (
    <div className="layout-stack-lg">
      {error && <ErrorState message={error} />}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Upload Section */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>Bank Statement Reconciliation</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Paste CSV data below (date,amount,reference,description) and click upload to process.
        </p>
        <textarea
          className="form-input"
          placeholder="date,amount,reference,description&#10;2026-01-15,5000,REF001,UPI payment&#10;2026-01-16,3000,REF002,CASH deposit"
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          rows={4}
          style={{ width: '100%', marginBottom: '12px', fontFamily: 'monospace', fontSize: '0.8rem' }}
        />
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn" onClick={handleUpload} disabled={loading || !csvText.trim()}>
            {loading ? 'Processing...' : 'Upload & Process'}
          </button>
          {csvText.trim() && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {(csvText.match(/\n/g) || []).length + 1} rows
            </span>
          )}
        </div>
      </div>

      {/* Summary Bar */}
      {!loading && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
          <StatCard label="Total Rows" value={stats.total} color="var(--text-primary)" />
          <StatCard label="Auto-Matched" value={stats.autoMatched} color="var(--success)" />
          <StatCard label="Needs Review" value={stats.needsReview} color="var(--warning)" />
          <StatCard label="Unmatched" value={stats.unmatched} color="var(--error)" />
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
            <Skeleton width="150px" />
            <Skeleton width="150px" />
            <Skeleton width="150px" />
            <Skeleton width="150px" />
          </div>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <Skeleton width="120px" />
              <Skeleton width="100px" />
              <Skeleton width="80px" />
              <Skeleton width="160px" />
              <Skeleton width="60px" />
              <Skeleton width="80px" />
            </div>
          ))}
        </div>
      )}

      {/* Results Table */}
      {!loading && items.length > 0 && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              placeholder="Search reference or description..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ flex: 1, minWidth: '200px' }}
            />
            <select
              className="form-input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ width: 'auto', minWidth: '140px' }}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s === 'All' ? 'All Statuses' : (STATUS_LABELS[s] || s)}</option>
              ))}
            </select>
          </div>

          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selectedIds.size} selected</span>
              <button className="btn" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => handleBulkAction('approve')} disabled={bulkLoading}>{bulkLoading ? 'Processing...' : 'Approve'}</button>
              <button className="btn btn-error" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => handleBulkAction('reject')} disabled={bulkLoading}>Reject</button>
              <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setSelectedIds(new Set())} disabled={bulkLoading}>Clear</button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '10px 8px', width: '32px' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: 'var(--primary)' }} />
                  </th>
                  <th style={{ padding: '10px 8px' }}>Date</th>
                  <th style={{ padding: '10px 8px' }}>Reference</th>
                  <th style={{ padding: '10px 8px' }}>Amount</th>
                  <th style={{ padding: '10px 8px' }}>Description</th>
                  <th style={{ padding: '10px 8px' }}>Confidence</th>
                  <th style={{ padding: '10px 8px' }}>Status</th>
                  <th style={{ padding: '10px 8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleItem(item.id)} style={{ accentColor: 'var(--primary)' }} />
                    </td>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{item.date}</td>
                    <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.reference || '—'}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>₹{Number(item.amount || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px 8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{item.description || '—'}</td>
                    <td style={{ padding: '10px 8px' }}>
                      {item.confidence != null && (
                        <span style={{
                          display: 'inline-block',
                          background: confidenceBg(item.confidence),
                          color: confidenceColor(item.confidence),
                          borderRadius: '20px',
                          padding: '2px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {item.confidence}%
                        </span>
                      )}
                      {item.confidence == null && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span className={BADGE_CLASS[item.status] || 'badge badge-pending'} style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {item.status === 'needs_review' && (
                        <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }} onClick={() => openDrawer(item)}>
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <EmptyState title="No results" message="Try adjusting your search or filter." />
          )}
        </div>
      )}

      {/* Batch History */}
      {!loading && batchHistory.length > 0 && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Batch History</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '10px 8px' }}>Date</th>
                  <th style={{ padding: '10px 8px' }}>Total</th>
                  <th style={{ padding: '10px 8px' }}>Matched</th>
                  <th style={{ padding: '10px 8px' }}>Needs Review</th>
                  <th style={{ padding: '10px 8px' }}>Unmatched</th>
                  <th style={{ padding: '10px 8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {batchHistory.map(batch => (
                  <tr key={batch.id || batch._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{batch.createdAt ? new Date(batch.createdAt).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '10px 8px' }}>{batch.total || batch.itemCount || 0}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--success)' }}>{batch.matched || 0}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--warning)' }}>{batch.needsReview || 0}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--error)' }}>{batch.unmatched || 0}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span className={`badge ${batch.status === 'completed' ? 'badge-active' : 'badge-pending'}`} style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                        {batch.status || 'unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Drawer */}
      {drawerItem && (
        <ReconciliationReviewDrawer
          item={drawerItem}
          onClose={() => setDrawerItem(null)}
          onResolve={(resolution) => handleResolve(drawerItem.id, resolution)}
        />
      )}
    </div>
  );
}
