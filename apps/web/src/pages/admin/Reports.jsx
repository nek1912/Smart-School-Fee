import React, { useState } from 'react';
import { useDashboardQuery } from '../../hooks/useDashboardQuery';

export default function Reports() {
  const [classFilter, setClassFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch real report data
  const { data: report, loading } = useDashboardQuery('/api/dashboard/reports', {
    class: classFilter,
    start_date: startDate,
    end_date: endDate
  }, 5000);

  const handleExportCSV = () => {
    if (!report) return;

    // Build standard CSV format string
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'SMART SCHOOL FINTECH - REVENUE & COLLECTION LEDGER REPORT\r\n';
    csvContent += `Generated On,${new Date().toLocaleString()}\r\n`;
    csvContent += `Filters,Class: ${classFilter || 'All Standards'}, Start Date: ${startDate || 'N/A'}, End Date: ${endDate || 'N/A'}\r\n\r\n`;
    
    csvContent += 'FINANCIAL LEDGER SUMMARY\r\n';
    csvContent += `Total Revenue Collected,INR ${Number(report.total_collected).toFixed(2)}\r\n`;
    csvContent += `Total Pending Balances,INR ${Number(report.total_pending).toFixed(2)}\r\n\r\n`;

    csvContent += 'COLLECTION BREAKDOWN BY CATEGORY\r\n';
    csvContent += 'Fee Category,Collected Amount (INR)\r\n';
    
    if (report.breakdown && report.breakdown.length > 0) {
      report.breakdown.forEach(item => {
        csvContent += `${item.type.toUpperCase()},${Number(item.total).toFixed(2)}\r\n`;
      });
    } else {
      csvContent += 'No category breakdown available for current filter set\r\n';
    }

    // Trigger dynamic browser download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SmartSchool_Financial_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="frosted-glass-card layout-stack-md" style={{ padding: '30px' }}>
      
      {/* Header and Export Action */}
      <div className="flex-between-wrap">
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 5px 0', color: '#0f172a' }}>
            Revenue & Collection Reports Ledger
          </h2>
          <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>
            Generate, filter, and review ledger balances matching custom academic year periods and grades.
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={!report || loading}
          className="btn"
          style={{
            padding: '8px 16px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)'
          }}
        >
          📥 Export Report (CSV)
        </button>
      </div>

      {/* Query Filters */}
      <div className="layout-grid-2-auto">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 600 }}>Class / Grade</label>
          <select 
            value={classFilter} 
            onChange={(e) => setClassFilter(e.target.value)} 
            className="form-input" 
            style={{ background: 'rgba(255,255,255,0.7)', color: '#0f172a', border: '1px solid rgba(0,0,0,0.1)' }}
          >
            <option value="">All Standards</option>
            <option value="Grade 1-A">Grade 1-A</option>
            <option value="Grade 2-C">Grade 2-C</option>
            <option value="Grade 5-A">Grade 5-A</option>
            <option value="Grade 10-A">Grade 10-A</option>
            <option value="Grade 10-B">Grade 10-B</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 600 }}>Start Date</label>
          <input
            type="date"
            className="form-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.7)', color: '#0f172a', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 600 }}>End Date</label>
          <input
            type="date"
            className="form-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.7)', color: '#0f172a', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: '0.85rem' }}>
          Generating report data...
        </div>
      ) : (
        <div className="layout-stack-md">
          
          {/* Summary Metric Cards */}
          <div className="grid-2">
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.15)', padding: '20px', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600, textTransform: 'uppercase' }}>
                Total Revenue Collected
              </span>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: '8px 0 0 0', color: '#065f46' }}>
                ₹{Number(report?.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.15)', padding: '20px', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: '#be123c', fontWeight: 600, textTransform: 'uppercase' }}>
                Total Pending Balances
              </span>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: '8px 0 0 0', color: '#9f1239' }}>
                ₹{Number(report?.total_pending || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Breakdown Table */}
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px', color: '#1e293b' }}>
              Collection Breakdown by Fee Category
            </h3>
            
            {(!report?.breakdown || report.breakdown.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b', fontSize: '0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                No categorized collections found within this query parameter range.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(15, 23, 42, 0.1)', color: '#475569' }}>
                    <th style={{ padding: '10px', fontWeight: 600 }}>Fee Type</th>
                    <th style={{ padding: '10px', fontWeight: 600, textAlign: 'right' }}>Amount Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {report.breakdown.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(15, 23, 42, 0.05)', color: '#1e293b' }}>
                      <td style={{ padding: '10px', fontWeight: 500, textTransform: 'uppercase' }}>{item.type}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700 }}>
                        ₹{Number(item.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
