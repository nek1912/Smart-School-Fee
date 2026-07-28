import { useState } from 'react';
import StatusBadge from './StatusBadge';

const DOT_COLORS = {
  payment: 'var(--success)',
  penalty: 'var(--error)',
  waiver: '#3b82f6',
  cheque: '#eab308',
};

function Dot({ type }) {
  const color = DOT_COLORS[type] || '#64748b';
  return (
    <div style={{
      position: 'absolute',
      left: '-22px',
      top: '16px',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: color,
      zIndex: 1,
      border: '2px solid var(--bg-color)',
    }} />
  );
}

function EventSkeleton() {
  return (
    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
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
  );
}

export default function TimelineVertical({ events = [], onEventClick, loading }) {
  const [expandedId, setExpandedId] = useState(null);

  if (loading) {
    return (
      <div style={{ position: 'relative', paddingLeft: '28px' }}>
        {[1, 2, 3].map(i => <EventSkeleton key={i} />)}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>No timeline events found.</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', paddingLeft: '28px' }}>
      <div style={{
        position: 'absolute',
        left: '13px',
        top: '8px',
        bottom: '8px',
        width: '2px',
        background: 'var(--glass-border)',
      }} />

      {events.map(event => {
        const isExpanded = expandedId === event.id;

        return (
          <div key={event.id} style={{ marginBottom: '20px', position: 'relative' }}>
            <Dot type={event.type} />

            <div
              className="glass-panel"
              style={{ padding: '16px 20px', cursor: 'pointer' }}
              onClick={() => {
                setExpandedId(isExpanded ? null : event.id);
                if (onEventClick) onEventClick(event);
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>
                    {event.title || event.type}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {event.timestamp ? new Date(event.timestamp).toLocaleString() : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {event.amount != null && (
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                      ₹{Number(event.amount).toLocaleString()}
                    </span>
                  )}
                  {event.status && <StatusBadge status={event.status} />}
                </div>
              </div>

              {isExpanded && event.details && (
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--glass-border)',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                }}>
                  {Object.entries(event.details).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)', minWidth: '100px', textTransform: 'capitalize' }}>
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span>{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
