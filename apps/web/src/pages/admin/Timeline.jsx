import { useState, useEffect, useCallback } from 'react';
import { api, normalizeApiError } from '../../api/client';
import TimelineVertical from '../../components/common/TimelineVertical';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

const FILTERS = ['All', 'Payments', 'Penalties', 'Waivers', 'Cheques'];

const TYPE_MAP = {
  All: undefined,
  Payments: 'payment',
  Penalties: 'penalty',
  Waivers: 'waiver',
  Cheques: 'cheque',
};

function StatCard({ label, value, color }) {
  return (
    <div className="glass-panel" style={{ padding: '16px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: color || 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{
        width: '200px', height: '20px', borderRadius: '8px',
        background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s infinite', marginBottom: '20px'
      }} />
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <div style={{
            width: '12px', height: '12px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', flexShrink: 0, marginTop: '4px'
          }} />
          <div style={{ flex: 1 }}>
            <div style={{
              height: '16px', width: '60%', borderRadius: '8px',
              background: 'rgba(255,255,255,0.06)', marginBottom: '8px'
            }} />
            <div style={{
              height: '12px', width: '40%', borderRadius: '8px',
              background: 'rgba(255,255,255,0.06)'
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function computeSummary(evts) {
  const totalPaid = evts.filter(e => e.type === 'payment').reduce((s, e) => s + (e.amount || 0), 0);
  const totalPending = evts.filter(e => e.status === 'pending').reduce((s, e) => s + (e.amount || 0), 0);
  const totalWaived = evts.filter(e => e.type === 'waiver').reduce((s, e) => s + (e.amount || 0), 0);
  const totalPenalized = evts.filter(e => e.type === 'penalty').reduce((s, e) => s + (e.amount || 0), 0);
  const paid = evts.filter(e => e.type === 'payment').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return { totalPaid, totalPending, totalWaived, totalPenalized, lastPaymentDate: paid[0]?.timestamp || null };
}

export default function Timeline() {
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [events, setEvents] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [beforeCursor, setBeforeCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');

  const loadStudents = useCallback(async () => {
    try {
      const res = await api.get('/admin/students');
      setStudents(res.data.students || res.data || []);
    } catch {}
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  const loadTimeline = useCallback(async (append = false) => {
    if (!selectedStudentId) return;

    const setLoadState = append ? setLoadingMore : setLoading;
    setLoadState(true);
    setError(null);

    try {
      const typeParam = TYPE_MAP[filter];
      const params = { limit: 50 };
      if (typeParam) params.types = typeParam;
      if (append && beforeCursor) params.before = beforeCursor;

      const res = await api.get(`/students/${selectedStudentId}/timeline`, { params });
      const data = res.data;
      const newEvents = data.events || [];

      setEvents(prev => append ? [...prev, ...newEvents] : newEvents);
      setHasMore(data.hasMore || false);
      setBeforeCursor(data.before || null);
    } catch (err) {
      setError(normalizeApiError(err));
      if (!append) setEvents([]);
    } finally {
      setLoadState(false);
    }
  }, [selectedStudentId, filter, beforeCursor]);

  useEffect(() => {
    if (selectedStudentId) {
      loadTimeline(false);
    } else {
      setEvents([]);
      setHasMore(false);
      setBeforeCursor(null);
    }
  }, [selectedStudentId, filter]);

  const handleSelectStudent = (e) => {
    setSelectedStudentId(e.target.value);
    setBeforeCursor(null);
    setHasMore(false);
  };

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) loadTimeline(true);
  };

  const summary = events.length > 0 ? computeSummary(events) : null;

  return (
    <div className="layout-stack-lg">
      {error && <ErrorState message={error} />}

      <div className="glass-panel" style={{ padding: '20px' }}>
        <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Select Student</label>
        <select
          className="form-input"
          value={selectedStudentId}
          onChange={handleSelectStudent}
          style={{ width: '100%', maxWidth: '400px' }}
        >
          <option value="">— Choose a student —</option>
          {students.map(s => (
            <option key={s.id || s._id} value={s.id || s._id}>
              {s.name || s.fullName || s.email || s.id}
            </option>
          ))}
        </select>
      </div>

      {summary && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <StatCard label="Total Paid" value={`₹${summary.totalPaid.toLocaleString()}`} color="var(--success)" />
          <StatCard label="Pending" value={`₹${summary.totalPending.toLocaleString()}`} color="var(--warning)" />
          <StatCard label="Waived" value={`₹${summary.totalWaived.toLocaleString()}`} color="#3b82f6" />
          <StatCard label="Penalized" value={`₹${summary.totalPenalized.toLocaleString()}`} color="var(--error)" />
          <StatCard
            label="Last Payment"
            value={summary.lastPaymentDate ? new Date(summary.lastPaymentDate).toLocaleDateString() : '—'}
            color="var(--text-primary)"
          />
        </div>
      )}

      {selectedStudentId && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f}
              type="button"
              className={filter === f ? 'btn' : 'btn btn-secondary'}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {loading && <SkeletonBlock />}

      {!loading && selectedStudentId && events.length > 0 && (
        <div>
          <TimelineVertical events={events} />

          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button
                className="btn btn-secondary"
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{ padding: '10px 24px', fontSize: '0.85rem' }}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && selectedStudentId && events.length === 0 && !error && (
        <EmptyState title="No Events" message="No timeline events found for this student." />
      )}
    </div>
  );
}
