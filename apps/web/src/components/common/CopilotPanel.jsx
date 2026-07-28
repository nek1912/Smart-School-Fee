import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../api/client';
import CopilotMessage from './CopilotMessage';

const QUICK_PROMPTS = [
  'Top Defaulters',
  "Today's Collection",
  'Revenue Summary',
  'Pending Dues',
  'Payment Methods',
  'Monthly Trend',
  'Fee Waivers Pending',
  'Bank vs Cash',
];

const TypingDots = () => (
  <div className="copilot-message-assistant">
    <div className="copilot-bubble copilot-bubble-assistant" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 16px' }}>
      <span className="copilot-typing-dot" style={{ animationDelay: '0s' }} />
      <span className="copilot-typing-dot" style={{ animationDelay: '0.15s' }} />
      <span className="copilot-typing-dot" style={{ animationDelay: '0.3s' }} />
    </div>
  </div>
);

export default function CopilotPanel({ open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (query) => {
    const text = (query || input).trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/copilot/query', { query: text });
      const reply = res.data.data;
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: reply.answer || reply.message || '',
        data: reply.data || null,
        chart: reply.chart || null,
        sourceNote: reply.sourceNote || null,
      }]);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Please try again.';
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errMsg}`,
        sourceNote: null,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="copilot-panel">
      <div className="copilot-panel-header">
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>AI Copilot</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
            fontSize: '1.2rem', lineHeight: 1, padding: '4px 8px', borderRadius: 6,
          }}
        >
          ✕
        </button>
      </div>

      <div className="copilot-chips">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="copilot-chip"
            onClick={() => handleSend(prompt)}
            disabled={loading}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="copilot-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: 40 }}>
            Ask me anything about fees, collections, or reports.
          </div>
        )}
        {messages.map((msg, i) => (
          <CopilotMessage key={i} message={msg} />
        ))}
        {loading && <TypingDots />}
        <div ref={messagesEndRef} />
      </div>

      <div className="copilot-input-area">
        <input
          type="text"
          className="copilot-input"
          placeholder="Ask about fees, collections..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          type="button"
          className="copilot-send-btn"
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}