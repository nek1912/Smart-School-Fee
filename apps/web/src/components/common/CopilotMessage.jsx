import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#6366f1', '#06b6d4', '#ec4899', '#f59e0b', '#10b981', '#f97316'];

const InlineChart = ({ chart }) => {
  if (!chart || !chart.data || chart.data.length === 0) return null;

  const data = chart.data;

  if (chart.type === 'pie') {
    return (
      <div style={{ width: '100%', height: 200, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.75rem', color: '#f8fafc' }}
              formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
            />
            <Legend
              verticalAlign="bottom" height={28}
              iconType="circle"
              wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 180, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
          <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.75rem', color: '#f8fafc' }}
            formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const DataTable = ({ data }) => {
  if (!data || data.length === 0) return null;
  const keys = Object.keys(data[0]);

  return (
    <div style={{ overflowX: 'auto', marginTop: 8, fontSize: '0.75rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 8).map((row, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td key={k} style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#e2e8f0' }}>
                  {typeof row[k] === 'number' ? `₹${row[k].toLocaleString('en-IN')}` : row[k]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 8 && (
        <div style={{ color: '#64748b', fontSize: '0.65rem', padding: '4px 6px' }}>
          +{data.length - 8} more rows
        </div>
      )}
    </div>
  );
};

export default function CopilotMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={isUser ? 'copilot-message-user' : 'copilot-message-assistant'}>
      <div className={`copilot-bubble ${isUser ? 'copilot-bubble-user' : 'copilot-bubble-assistant'}`}>
        {message.content && (
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message.content}</div>
        )}
        {message.chart && <InlineChart chart={message.chart} />}
        {message.data && !message.chart && <DataTable data={message.data} />}
        {message.sourceNote && (
          <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4 }}>
            {message.sourceNote}
          </div>
        )}
      </div>
    </div>
  );
}