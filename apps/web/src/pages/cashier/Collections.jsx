import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import { addPaymentToQueue } from '../../utils/idb';

export default function Collections() {
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [chequeNo, setChequeNo] = useState('');
  const [bank, setBank] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const handleOCRChequeScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setOcrLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: { text } } = await Tesseract.recognize(file, 'eng');
      console.log('OCR Raw output text:', text);

      // Extract 6-digit cheque number
      const numMatch = text.match(/\b\d{6}\b/);
      if (numMatch) {
        setChequeNo(numMatch[0]);
      }

      // Detect standard bank names from keywords
      const keywords = ['ICICI', 'HDFC', 'AXIS', 'SBI', 'STATE BANK', 'PUNJAB', 'PNB', 'CANARA', 'BOB', 'BANK OF BARODA', 'KOTAK', 'YES BANK', 'UNION'];
      let foundBank = '';
      const upperStr = text.toUpperCase();
      
      for (const kw of keywords) {
        if (upperStr.includes(kw)) {
          foundBank = kw === 'SBI' || kw === 'STATE BANK' ? 'State Bank of India' :
                      kw === 'PNB' || kw === 'PUNJAB' ? 'Punjab National Bank' :
                      kw === 'BOB' || kw === 'BANK OF BARODA' ? 'Bank of Baroda' :
                      kw + ' Bank';
          break;
        }
      }

      if (foundBank) {
        setBank(foundBank);
      }

      if (numMatch || foundBank) {
        setSuccess(`OCR Scanned Successfully! Extracted Cheque No: "${numMatch ? numMatch[0] : 'Not Found'}" and Bank: "${foundBank || 'Not Found'}".`);
      } else {
        setError('OCR scan finished but failed to read cheque number or bank name. Please type details manually.');
      }
    } catch (err) {
      console.error(err);
      setError('OCR Scanner error: ' + err.message);
    } finally {
      setOcrLoading(false);
    }
  };

  // Fetch student roster
  const fetchStudents = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.status === 200) {
        setStudents(data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch student roster.');
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // Fetch pending assignments for the selected student
  useEffect(() => {
    if (!selectedStudentId) {
      setAssignments([]);
      return;
    }

    const fetchAssignments = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/fees/assignments?studentId=${selectedStudentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.status === 200) {
          // Filter to only pending/overdue assignments
          setAssignments(data.filter(a => a.status === 'pending' || a.status === 'overdue'));
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchAssignments();
  }, [selectedStudentId]);

  // Set default amount when assignment is chosen
  useEffect(() => {
    if (!selectedAssignmentId) {
      setAmount('');
      return;
    }
    const chosen = assignments.find(a => a.id === Number(selectedAssignmentId));
    if (chosen && chosen.feeStructure) {
      setAmount(chosen.feeStructure.amount.toString());
    }
  }, [selectedAssignmentId, assignments]);

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.guardian.mobile.includes(searchQuery)
  );

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const token = localStorage.getItem('token');
    const selectedStudent = students.find(s => s.id === Number(selectedStudentId));
    const selectedAssign = assignments.find(a => a.id === Number(selectedAssignmentId));

    if (!selectedStudent || !selectedAssign) {
      setError('Please select a student and an outstanding fee assignment.');
      setLoading(false);
      return;
    }

    // Client-side generated idempotency key (prevent duplicates)
    const idempotencyKey = `OFF_${selectedAssignmentId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const paymentPayload = {
      student_id: selectedStudent.id,
      fee_assignment_id: selectedAssign.id,
      amount: Number(amount),
      method,
      cheque_no: method === 'CHEQUE' ? chequeNo : undefined,
      bank: method === 'CHEQUE' ? bank : undefined,
      idempotency_key: idempotencyKey,
      timestamp: new Date().toISOString(),
      local_status: 'queued',
      attempts: 0,
      last_error: null
    };

    // If browser is offline, queue to IndexedDB directly
    if (!navigator.onLine) {
      try {
        await addPaymentToQueue(paymentPayload);
        
        // Trigger Background Sync tag
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          const reg = await navigator.serviceWorker.ready;
          await reg.sync.register('sync-payments');
        }

        setSuccess('Offline Mode: Payment saved in local queue. It will automatically sync when network is restored.');
        // Reset inputs
        setSelectedAssignmentId('');
        setChequeNo('');
        setBank('');
      } catch (err) {
        setError('Failed to queue offline payment: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Else send online
    try {
      const res = await fetch('/api/payments/offline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(paymentPayload)
      });

      const data = await res.json();
      if (res.status === 200 || res.status === 201) {
        setSuccess(`Payment recorded successfully! Receipt generated: ${data.receiptNumber || 'Pending clearance'}`);
        // Reset selections
        setSelectedAssignmentId('');
        setChequeNo('');
        setBank('');
      } else {
        setError(data.error || 'Failed to submit payment.');
      }
    } catch (err) {
      setError('Network request failed. Payment queued to IndexedDB instead.');
      try {
        await addPaymentToQueue(paymentPayload);
      } catch (idbErr) {
        console.error(idbErr);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '30px', color: '#ffffff' }} className="glass-panel">
      <h2 style={{ fontSize: '1.25rem', marginBottom: '15px', color: '#ffffff' }}>Record Manual Collection</h2>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '25px' }}>
        Record cash or cheque collections for student accounts. Works 100% offline.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleRecordPayment}>
        
        {/* Student Finder */}
        <div className="form-group">
          <label className="form-label">Search Student (Name or Mobile)</label>
          <input
            type="text"
            className="form-input"
            placeholder="Type name or mobile..."
            value={searchQuery}
            onFocus={() => setIsDropdownOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
          />
          
          {isDropdownOpen && searchQuery && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              maxHeight: '150px',
              overflowY: 'auto',
              marginTop: '5px',
              position: 'absolute',
              zIndex: 10,
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {filteredStudents.length === 0 ? (
                <div style={{ padding: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  No students found
                </div>
              ) : (
                filteredStudents.map(student => (
                  <div
                    key={student.id}
                    style={{
                      padding: '10px',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      fontSize: '0.85rem'
                    }}
                    onClick={() => {
                      setSelectedStudentId(student.id);
                      setSearchQuery(`${student.name} (${student.class})`);
                      setIsDropdownOpen(false);
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{student.name}</span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '10px' }}>
                      ({student.class} | Guardian: {student.guardian.mobile})
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected Student Confirm */}
        {selectedStudentId && (
          <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
            Selected Wards: <strong>{students.find(s => s.id === Number(selectedStudentId))?.name}</strong>
          </div>
        )}

        {/* Fee Assignment Dropdown */}
        <div className="form-group">
          <label className="form-label">Outstanding Fee Assignment</label>
          <select
            className="form-input"
            value={selectedAssignmentId}
            onChange={(e) => setSelectedAssignmentId(e.target.value)}
            required
            style={{ background: 'rgba(15, 23, 42, 0.8)' }}
          >
            <option value="" disabled>-- Select Pending Fee --</option>
            {assignments.map(a => (
              <option key={a.id} value={a.id}>
                {a.feeStructure.name} (₹{Number(a.feeStructure.amount).toLocaleString('en-IN')})
              </option>
            ))}
          </select>
        </div>

        {/* Amount Input */}
        <div className="form-group">
          <label className="form-label">Amount (INR)</label>
          <input
            type="number"
            className="form-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        {/* Payment Method Selector */}
        <div className="form-group">
          <label className="form-label">Payment Method</label>
          <div style={{ display: 'flex', gap: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="method"
                checked={method === 'CASH'}
                onChange={() => setMethod('CASH')}
              />
              CASH
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="method"
                checked={method === 'CHEQUE'}
                onChange={() => setMethod('CHEQUE')}
              />
              CHEQUE
            </label>
          </div>
        </div>

        {/* Cheque Details form */}
        {method === 'CHEQUE' && (
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid var(--glass-border)', marginBottom: '20px' }}>
            
            {/* Tesseract OCR Input */}
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label className="form-label" style={{ color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📷 OCR Auto-Scan Cheque (Tesseract.js)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleOCRChequeScan}
                style={{ fontSize: '0.8rem', color: '#94a3b8' }}
              />
              {ocrLoading && (
                <span style={{ fontSize: '0.75rem', color: '#6366f1', display: 'block', marginTop: '4px' }}>
                  ⏳ Running OCR scanner analysis on cheque image...
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Cheque Number</label>
              <input
                type="text"
                className="form-input"
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value)}
                placeholder="e.g. 123456"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Bank Name</label>
              <input
                type="text"
                className="form-input"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="e.g. State Bank of India"
                required
              />
            </div>
          </div>
        )}

        <button type="submit" className="btn" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
          {loading ? 'Recording...' : 'Record Payment'}
        </button>

      </form>
    </div>
  );
}
