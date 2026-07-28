import React, { useState } from 'react';
import { useDashboardQuery } from '../../hooks/useDashboardQuery';

export default function DefaulterList() {
  // Sort by AI predicted risk by default to showcase the differentiator
  const [sortBy, setSortBy] = useState('risk');
  const [filterClass, setFilterClass] = useState('');

  // Fetch live prioritized defaulters data
  const { data, loading } = useDashboardQuery('/api/dashboard/defaulters', {
    sort_by: sortBy,
    filter_class: filterClass
  }, 5000);
  const defaulters = data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      
      {/* Search & Sort Panel */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="form-input"
          style={{ padding: '6px 12px', fontSize: '0.75rem', width: '170px', margin: 0, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.1)', color: '#000' }}
        >
          <option value="risk">Sort by AI Default Risk</option>
          <option value="days">Sort by Days</option>
          <option value="amount">Sort by Amount</option>
        </select>
        
        <select 
          value={filterClass} 
          onChange={(e) => setFilterClass(e.target.value)} 
          className="form-input" 
          style={{ padding: '6px 12px', fontSize: '0.75rem', width: '140px', margin: 0, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.1)', color: '#000' }}
        >
          <option value="">All Classes</option>
          <option value="Grade 1-A">Grade 1-A</option>
          <option value="Grade 2-C">Grade 2-C</option>
          <option value="Grade 5-A">Grade 5-A</option>
          <option value="Grade 10-A">Grade 10-A</option>
          <option value="Grade 10-B">Grade 10-B</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: '0.85rem' }}>
          Querying defaulter logs...
        </div>
      ) : defaulters.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: '0.85rem' }}>
          No student accounts are currently overdue.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', minWidth: '400px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(15, 23, 42, 0.1)', color: '#475569' }}>
                <th style={{ padding: '12px 10px', fontWeight: 600 }}>Student Name</th>
                <th style={{ padding: '12px 10px', fontWeight: 600 }}>Class</th>
                <th style={{ padding: '12px 10px', fontWeight: 600, textAlign: 'center' }}>Overdue Days</th>
                <th style={{ padding: '12px 10px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '12px 10px', fontWeight: 600, textAlign: 'center' }}>AI Default Prediction</th>
                <th style={{ padding: '12px 10px', fontWeight: 600, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {defaulters.map((defaulter, idx) => {
                const riskPct = defaulter.default_risk_pct || 10;
                const isCritical = riskPct > 70;

                // Build pre-filled WhatsApp reminder text
                const waText = encodeURIComponent(
                  `Dear parent ${defaulter.guardian_name || 'Guardian'}, this is an urgent reminder from SmartSchool FinTech that the pending fee of INR ${Number(defaulter.overdue_amount).toLocaleString('en-IN')} for your ward ${defaulter.name} is overdue by ${defaulter.overdue_days} days. Please clear it immediately. Thank you!`
                );
                const waUrl = `https://wa.me/${defaulter.guardian_mobile || '919999999999'}?text=${waText}`;

                return (
                  <tr 
                    key={idx} 
                    style={{ 
                      borderBottom: '1px solid rgba(15, 23, 42, 0.05)',
                      color: '#1e293b',
                      background: isCritical ? 'rgba(239, 68, 68, 0.06)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 10px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {defaulter.name}
                      {isCritical && (
                        <span style={{
                          fontSize: '0.65rem',
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#e11d48',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700
                        }}>
                          HIGH RISK
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 10px' }}>{defaulter.class}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 600, color: isCritical ? '#e11d48' : '#475569' }}>
                      {defaulter.overdue_days} days
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700 }}>
                      ₹{Number(defaulter.overdue_amount).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                        <div style={{ width: '80px', height: '6px', background: 'rgba(0,0,0,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${riskPct}%`,
                            height: '100%',
                            background: riskPct > 70 ? '#e11d48' : 
                                        riskPct > 35 ? '#d97706' : '#059669'
                          }} />
                        </div>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          minWidth: '32px',
                          textAlign: 'left',
                          color: riskPct > 70 ? '#e11d48' : 
                                 riskPct > 35 ? '#d97706' : '#059669'
                        }}>
                          {riskPct}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <a 
                        href={waUrl}
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="btn" 
                        style={{ 
                          padding: '4px 10px', 
                          fontSize: '0.7rem', 
                          fontWeight: 600,
                          borderRadius: '6px',
                          background: '#25D366', 
                          color: '#ffffff',
                          boxShadow: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          textDecoration: 'none'
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.94 0c3.202.001 6.212 1.248 8.477 3.517 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.618-5.329 11.943-11.943 11.943-1.996-.001-3.957-.5-5.688-1.448L0 24zm6.59-4.859c1.72.1.133.003 1.02.504 1.57.89 3.376 1.362 5.21 1.363 5.613 0 10.177-4.563 10.18-10.18.002-2.72-1.055-5.279-2.971-7.197-1.916-1.919-4.475-2.977-7.199-2.978-5.62 0-10.184 4.564-10.187 10.18C2.73 12.18 3.23 13.97 4.18 15.54c.099.162.296.222.453.31l.5.342-.99 3.61 3.733-.98c.17-.04.351-.01.5.07l.034.02z" />
                        </svg>
                        WA Reminder
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
