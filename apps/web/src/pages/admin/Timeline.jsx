import { useState, useEffect, useCallback } from 'react';
import { api, normalizeApiError } from '../../api/client';
import TimelineVertical from '../../components/common/TimelineVertical';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

const EVENT_FILTERS = ['All', 'Payments', 'Penalties', 'Waivers', 'Cheques'];

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
  const totalPaid = evts.filter(e => e.type === 'payment_success').reduce((s, e) => s + (e.amount || 0), 0);
  const totalPending = evts.filter(e => e.status === 'pending').reduce((s, e) => s + (e.amount || 0), 0);
  const totalWaived = evts.filter(e => e.type.startsWith('waiver')).reduce((s, e) => s + (e.amount || 0), 0);
  const totalPenalized = evts.filter(e => e.type === 'penalty_applied').reduce((s, e) => s + (e.amount || 0), 0);
  const paid = evts.filter(e => e.type === 'payment_success').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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
  const [eventFilter, setEventFilter] = useState('All');
  const [eventSearch, setEventSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [eventPage, setEventPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const pageSize = 20;

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
      const typeParam = TYPE_MAP[eventFilter];
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
  }, [selectedStudentId, eventFilter, beforeCursor]);

  useEffect(() => {
    if (selectedStudentId) {
      loadTimeline(false);
    } else {
      setEvents([]);
      setHasMore(false);
      setBeforeCursor(null);
    }
  }, [selectedStudentId, eventFilter]);

  const handleSelectStudent = (id) => {
    setSelectedStudentId(id);
    setBeforeCursor(null);
    setHasMore(false);
    setEventPage(1);
  };

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) loadTimeline(true);
  };

  const summary = events.length > 0 ? computeSummary(events) : null;

  const filteredEvents = events.filter(e => {
    const matchSearch = !eventSearch ||
      (e.description || e.details || e.amount?.toString() || '').toLowerCase().includes(eventSearch.toLowerCase());
    const matchDateFrom = !dateFrom || new Date(e.timestamp) >= new Date(dateFrom);
    const matchDateTo = !dateTo || new Date(e.timestamp) <= new Date(dateTo + 'T23:59:59');
    return matchSearch && matchDateFrom && matchDateTo;
  });

  const eventTotalPages = Math.ceil(filteredEvents.length / pageSize);
  const paginatedEvents = filteredEvents.slice((eventPage - 1) * pageSize, eventPage * pageSize);

  useEffect(() => { setEventPage(1); }, [eventSearch, dateFrom, dateTo]);

  const uniqueClasses = [...new Set(students.map(s => s.class?.split('-')[0]).filter(Boolean))].sort();
  const uniqueDivisions = [...new Set(students.map(s => s.class?.split('-')[1]).filter(Boolean))].sort();

  const filteredStudents = students.filter(s => {
    const matchSearch = !studentSearch ||
      s.name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.class?.toLowerCase().includes(studentSearch.toLowerCase());
    const matchClass = !classFilter || s.class?.startsWith(classFilter);
    const matchDivision = !divisionFilter || s.class?.endsWith(`-${divisionFilter}`);
    return matchSearch && matchClass && matchDivision;
  });

  const studentTotalPages = Math.ceil(filteredStudents.length / pageSize);
  const paginatedStudents = filteredStudents.slice((studentPage - 1) * pageSize, studentPage * pageSize);

  useEffect(() => { setStudentPage(1); }, [studentSearch, classFilter, divisionFilter]);

  return (
    <div className="layout-stack-lg">
      {error && <ErrorState message={error} />}

      <div className="glass-panel panel-padded">
        <div className="flex-between" style={{ marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '5px' }}>Timeline</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {students.length} students registered
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search by name or class..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              style={{ width: '200px' }}
            />
            <select className="form-input" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ width: '100px' }}>
              <option value="">All Classes</option>
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="form-input" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} style={{ width: '110px' }}>
              <option value="">All Divisions</option>
              {uniqueDivisions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {loading && !selectedStudentId ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>Loading...</p>
        ) : filteredStudents.length === 0 ? (
          <EmptyState title="No Students" message="No students found." />
        ) : (
          <div className="overflow-table">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '10px' }}>#</th>
                  <th style={{ padding: '10px' }}>Name</th>
                  <th style={{ padding: '10px' }}>Class</th>
                  <th style={{ padding: '10px' }}>Guardian</th>
                  <th style={{ padding: '10px' }}>Phone</th>
                  <th style={{ padding: '10px' }}>Fees Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStudents.map((student, idx) => {
                  const isSelected = selectedStudentId === (student.id || student._id);
                  return (
                    <tr
                      key={student.id || student._id}
                      onClick={() => handleSelectStudent(student.id || student._id)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{(studentPage - 1) * pageSize + idx + 1}</td>
                      <td style={{ padding: '10px', fontWeight: 500 }}>{student.name}</td>
                      <td style={{ padding: '10px' }}>{student.class}</td>
                      <td style={{ padding: '10px' }}>{student.guardian?.name || 'N/A'}</td>
                      <td style={{ padding: '10px' }}>{student.guardian?.mobile || 'N/A'}</td>
                      <td style={{ padding: '10px' }}>
                        <span className={`badge ${student.feesStatus === 'paid' ? 'badge-success' : student.feesStatus === 'unpaid' ? 'badge-warning' : ''}`}
                          style={{ fontSize: '0.7rem', textTransform: 'capitalize' }}>
                          {student.feesStatus || 'not_assigned'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {studentTotalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '15px' }}>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}
              disabled={studentPage === 1} onClick={() => setStudentPage(p => p - 1)}>
              ← Previous
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Page {studentPage} of {studentTotalPages} ({filteredStudents.length} students)
            </span>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}
              disabled={studentPage === studentTotalPages} onClick={() => setStudentPage(p => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>

      {selectedStudentId && (
        <>
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

          <div className="glass-panel panel-padded">
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search events..."
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                style={{ width: '200px' }}
              />
              <select
                className="form-input"
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                style={{ width: '130px' }}
              >
                {EVENT_FILTERS.map(f => (
                  <option key={f} value={f}>{f === 'All' ? 'All Types' : f}</option>
                ))}
              </select>
              <input
                type="date"
                className="form-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ width: '140px' }}
                title="From date"
              />
              <input
                type="date"
                className="form-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ width: '140px' }}
                title="To date"
              />
            </div>
          </div>

          {loading && <SkeletonBlock />}

          {!loading && filteredEvents.length > 0 && (
            <div>
              <TimelineVertical events={paginatedEvents} />

              {eventTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                    disabled={eventPage === 1} onClick={() => setEventPage(p => p - 1)}>
                    ← Previous
                  </button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Page {eventPage} of {eventTotalPages} ({filteredEvents.length} events)
                  </span>
                  <button type="button" className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                    disabled={eventPage === eventTotalPages} onClick={() => setEventPage(p => p + 1)}>
                    Next →
                  </button>
                </div>
              )}

              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    style={{ padding: '8px 20px', fontSize: '0.8rem' }}
                  >
                    {loadingMore ? 'Loading...' : 'Load More Events'}
                  </button>
                </div>
              )}
            </div>
          )}

          {!loading && filteredEvents.length === 0 && (
            <EmptyState title="No Events" message="No timeline events match your filters. Try adjusting your search or date range." />
          )}
        </>
      )}
    </div>
  );
}
