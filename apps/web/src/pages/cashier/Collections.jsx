import React, { useState, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addPaymentToQueue } from '../../utils/idb';

export default function Collections() {
  const [step, setStep] = useState(1);
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [feeStructures, setFeeStructures] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedFeeId, setSelectedFeeId] = useState(null);
  const [method, setMethod] = useState('CASH');
  const [chequeNo, setChequeNo] = useState('');
  const [bank, setBank] = useState('');
const [searchQuery, setSearchQuery] = useState('');
const [isDropdownOpen, setIsDropdownOpen] = useState(false);
const [classFilter, setClassFilter] = useState('');
const [divisionFilter, setDivisionFilter] = useState('');
const [feesStatusFilter, setFeesStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const LATE_FEE_AMOUNT = 500;

  const goToStep = (newStep) => {
    setError(null);
    setStep(newStep);
  };

  const handleBack = () => {
    if (step === 2) {
      setSelectedAssignmentId(null);
    }
    goToStep(step - 1);
  };

  const calculateLateFee = (assignment) => {
    if (assignment.status !== 'overdue') return 0;
    return LATE_FEE_AMOUNT;
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedStudentId(null);
    setSelectedFeeId(null);
    setSearchQuery('');
    setChequeNo('');
    setBank('');
    setMethod('CASH');
  };

  const handleOCRChequeScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setOcrLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: { text } } = await Tesseract.recognize(file, 'eng');
      console.log('OCR Raw output text:', text);

      const numMatch = text.match(/\b\d{6}\b/);
      if (numMatch) {
        setChequeNo(numMatch[0]);
      }

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
    fetchFeeStructures();
  }, []);

  const fetchFeeStructures = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/fees/structures', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.status === 200) {
        setFeeStructures(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!selectedStudentId) {
      setAssignments([]);
      return;
    }

    const fetchAssignments = async () => {
      setAssignmentsLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/fees/assignments?studentId=${selectedStudentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.status === 200) {
          setAssignments(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setAssignmentsLoading(false);
      }
    };

    fetchAssignments();
  }, [selectedStudentId]);

const uniqueClasses = [...new Set(students.map(s => s.class?.split('-')[0]).filter(Boolean))].sort();
const uniqueDivisions = [...new Set(students.map(s => s.class?.split('-')[1]).filter(Boolean))].sort();

const filteredStudents = students.filter(s => {
  const matchQuery = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.guardian?.mobile || '').includes(searchQuery);
  const matchClass = !classFilter || s.class?.startsWith(classFilter);
  const matchDivision = !divisionFilter || s.class?.endsWith(`-${divisionFilter}`);
  const matchFees = !feesStatusFilter || s.feesStatus === feesStatusFilter;
  return matchQuery && matchClass && matchDivision && matchFees;
});

  const handleRecordPayment = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const token = localStorage.getItem('token');
    const selectedStudent = students.find(s => s.id === Number(selectedStudentId));
    const selectedFee = feeStructures.find(f => f.id === Number(selectedFeeId));
    const existingAssignment = assignments.find(a => a.feeStructureId === Number(selectedFeeId));

    if (!selectedStudent || !selectedFee) {
      setError('Please complete all steps before submitting.');
      setLoading(false);
      return;
    }

    if (!existingAssignment) {
      setError('No fee assignment found for this student and fee. Please assign the fee first.');
      setLoading(false);
      return;
    }

    const baseAmount = Number(selectedFee.amount);
    const isOverdue = existingAssignment && existingAssignment.status === 'overdue';
    const lateFee = isOverdue ? LATE_FEE_AMOUNT : 0;
    const totalAmount = baseAmount + lateFee;

    const idempotencyKey = `OFF_${selectedFeeId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const paymentPayload = {
      student_id: selectedStudent.id,
      fee_assignment_id: existingAssignment ? existingAssignment.id : null,
      fee_structure_id: selectedFee.id,
      amount: totalAmount,
      method,
      cheque_no: method === 'CHEQUE' ? chequeNo : undefined,
      bank: method === 'CHEQUE' ? bank : undefined,
      idempotency_key: idempotencyKey,
      timestamp: new Date().toISOString(),
      local_status: 'queued',
      attempts: 0,
      last_error: null
    };

    if (!navigator.onLine) {
      try {
        await addPaymentToQueue(paymentPayload);
        
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          const reg = await navigator.serviceWorker.ready;
          await reg.sync.register('sync-payments');
        }

        setSuccess('Offline Mode: Payment saved in local queue. It will automatically sync when network is restored.');
        resetWizard();
      } catch (err) {
        setError('Failed to queue offline payment: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

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
        const receipt = data.receiptNumber || data.transaction?.receiptNumber;
        setSuccess(method === 'CASH'
          ? `Cash payment recorded. Receipt: ${receipt || 'created'}.`
          : 'Cheque recorded. Receipt will be generated after bank clearance.');
        resetWizard();
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

  const StepIndicator = () => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '25px' }}>
      {[1, 2, 3].map((s) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 600,
            background: step >= s ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
            color: step >= s ? '#818cf8' : '#64748b',
            border: step === s ? '2px solid #818cf8' : '1px solid transparent'
          }}>
            {s}
          </div>
          {s < 3 && (
            <div style={{ width: '40px', height: '2px', background: step > s ? '#818cf8' : 'rgba(255,255,255,0.1)' }} />
          )}
        </div>
      ))}
    </div>
  );

  const Step1SelectStudent = () => (
    <div>
      <h3 style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '15px' }}>Select Student</h3>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <select className="form-input" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ width: '110px', background: 'rgba(15, 23, 42, 0.8)', fontSize: '0.8rem' }}>
          <option value="">All Classes</option>
          {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-input" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} style={{ width: '110px', background: 'rgba(15, 23, 42, 0.8)', fontSize: '0.8rem' }}>
          <option value="">All Divisions</option>
          {uniqueDivisions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="form-input" value={feesStatusFilter} onChange={(e) => setFeesStatusFilter(e.target.value)} style={{ width: '130px', background: 'rgba(15, 23, 42, 0.8)', fontSize: '0.8rem' }}>
          <option value="">All Fee Status</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="not_assigned">Not Assigned</option>
        </select>
      </div>
      
      <div className="form-group" style={{ position: 'relative' }}>
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
          onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
        />
        
        {isDropdownOpen && searchQuery && (
          <div style={{
            background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '8px',
            maxHeight: '150px', overflowY: 'auto', marginTop: '5px', position: 'absolute', zIndex: 10,
            width: '100%', boxSizing: 'border-box'
          }}>
            {filteredStudents.length === 0 ? (
              <div style={{ padding: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No students found</div>
            ) : (
              filteredStudents.map(student => (
                <div
                  key={student.id}
                  style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.85rem' }}
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

      {selectedStudentId && (
        <div style={{
          background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)',
          padding: '15px', borderRadius: '10px', marginTop: '15px'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Selected Student</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginTop: '5px' }}>
            {students.find(s => s.id === Number(selectedStudentId))?.name}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '3px' }}>
            Class: {students.find(s => s.id === Number(selectedStudentId))?.class}
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn"
        style={{ width: '100%', marginTop: '20px' }}
        disabled={!selectedStudentId}
        onClick={() => goToStep(2)}
      >
        Continue
      </button>

      {filteredStudents.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            const csv = [['Name','Class','Guardian','Phone','Fees Status'],...filteredStudents.map(s=>[s.name,s.class,s.guardian?.name||'N/A',s.guardian?.mobile||'N/A',s.feesStatus||'not_assigned'])]
              .map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
            const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
            const a=document.createElement('a');a.href=url;a.download='students.csv';a.click();
            URL.revokeObjectURL(url);
          }} style={{ fontSize: '0.75rem' }}>Download CSV</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            const doc = new jsPDF({ orientation: 'landscape' });
            doc.setFontSize(16);
            doc.text('Student List', 14, 15);
            doc.setFontSize(10);
            doc.text(`${filteredStudents.length} students`, 14, 22);
            autoTable(doc, {
              startY: 28,
              head: [['Name', 'Class', 'Guardian', 'Phone', 'Fees Status']],
              body: filteredStudents.map(s => [
                s.name,
                s.class,
                s.guardian?.name || 'N/A',
                s.guardian?.mobile || 'N/A',
                s.feesStatus || 'not_assigned'
              ]),
              styles: { fontSize: 8 },
              headStyles: { fillColor: [30, 41, 59] }
            });
            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'students.pdf';
            a.click();
            URL.revokeObjectURL(url);
          }} style={{ fontSize: '0.75rem' }}>Download PDF</button>
        </div>
      )}
    </div>
  );

  const Step2ChooseFee = () => {
    const mergedFees = feeStructures.map(fs => {
      const assignment = assignments.find(a => a.feeStructureId === fs.id);
      return {
        feeStructure: fs,
        assignment: assignment || null,
        status: assignment ? assignment.status : 'not_assigned',
        dueDate: assignment ? assignment.dueDate : null
      };
    });

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
          <button
            type="button"
            onClick={handleBack}
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '5px' }}
          >
            ← Back
          </button>
          <h3 style={{ fontSize: '1rem', color: '#ffffff' }}>Choose Fee</h3>
        </div>

        {assignmentsLoading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Loading fees...</div>
        ) : mergedFees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>No fee structures found</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {mergedFees.map(item => {
              const baseAmount = Number(item.feeStructure.amount);
              const isOverdue = item.status === 'overdue';
              const lateFee = isOverdue ? LATE_FEE_AMOUNT : 0;
              const isSelected = selectedFeeId === item.feeStructure.id;
              
              return (
                <div
                  key={item.feeStructure.id}
                  onClick={() => setSelectedFeeId(item.feeStructure.id)}
                  style={{
                    background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: isSelected ? '2px solid #818cf8' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px', padding: '15px', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>{item.feeStructure.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '3px' }}>
                        {item.dueDate ? `Due: ${new Date(item.dueDate).toLocaleDateString('en-IN')}` : item.feeStructure.type}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>₹{baseAmount.toLocaleString('en-IN')}</div>
                      {isOverdue && (
                        <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '3px' }}>+₹{lateFee} late fee</div>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <span style={{
                      fontSize: '0.7rem', padding: '3px 8px', borderRadius: '12px',
                      background: isOverdue ? 'rgba(248, 113, 113, 0.15)' : item.status === 'pending' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: isOverdue ? '#f87171' : item.status === 'pending' ? '#fbbf24' : '#818cf8'
                    }}>
                      {isOverdue ? 'Overdue' : item.status === 'pending' ? 'Pending' : 'Available'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="btn"
          style={{ width: '100%', marginTop: '20px' }}
          disabled={!selectedFeeId}
          onClick={() => goToStep(3)}
        >
          Continue to Checkout
        </button>
      </div>
    );
  };

  const Step3Checkout = () => {
    const selectedStudent = students.find(s => s.id === Number(selectedStudentId));
    const selectedFee = feeStructures.find(f => f.id === Number(selectedFeeId));
    const existingAssignment = assignments.find(a => a.feeStructureId === Number(selectedFeeId));
    
    if (!selectedStudent || !selectedFee) {
      return <div style={{ color: '#f87171' }}>Error: No selection found</div>;
    }

    const baseAmount = Number(selectedFee.amount);
    const isOverdue = existingAssignment && existingAssignment.status === 'overdue';
    const lateFee = isOverdue ? LATE_FEE_AMOUNT : 0;
    const totalAmount = baseAmount + lateFee;

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
          <button
            type="button"
            onClick={handleBack}
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '5px' }}
          >
            ← Back
          </button>
          <h3 style={{ fontSize: '1rem', color: '#ffffff' }}>Checkout</h3>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px', padding: '20px'
        }}>
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Student</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>
              {selectedStudent.name} ({selectedStudent.class})
            </div>
          </div>

          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Fee</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>
              {selectedFee.name}
            </div>
            {existingAssignment && (
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '3px' }}>
                Due: {new Date(existingAssignment.dueDate).toLocaleDateString('en-IN')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Base Fee</span>
              <span style={{ fontSize: '0.9rem', color: '#ffffff' }}>₹{baseAmount.toLocaleString('en-IN')}</span>
            </div>
            
            {lateFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.9rem', color: '#f87171' }}>Late Fee</span>
                <span style={{ fontSize: '0.9rem', color: '#f87171' }}>+₹{lateFee.toLocaleString('en-IN')}</span>
              </div>
            )}
            
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', marginTop: '10px'
            }}>
              <span style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>TOTAL</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#818cf8' }}>₹{totalAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '15px' }}>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '10px' }}>Payment Method</div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="radio" name="method" checked={method === 'CASH'} onChange={() => setMethod('CASH')} />
                CASH
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="radio" name="method" checked={method === 'CHEQUE'} onChange={() => setMethod('CHEQUE')} />
                CHEQUE
              </label>
            </div>
          </div>

          {method === 'CHEQUE' && (
            <div style={{ marginTop: '15px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
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
        </div>

        <button
          type="button"
          className="btn"
          style={{ width: '100%', marginTop: '20px' }}
          disabled={loading || (method === 'CHEQUE' && (!chequeNo || !bank))}
          onClick={handleRecordPayment}
        >
          {loading ? 'Recording...' : 'Record Payment'}
        </button>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '30px', color: '#ffffff' }} className="glass-panel">
      <div className="flex-between" style={{ marginBottom: '15px' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#ffffff' }}>Fee Collection</h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ padding: '6px 14px', fontSize: '0.75rem' }}
          onClick={() => { 
            fetchStudents(); 
            if (selectedStudentId) { 
              setSelectedStudentId(null); 
              setStep(1);
            } 
          }}
        >
          ↻ Refresh
        </button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '25px' }}>
        Record cash or cheque collections for student accounts. Works 100% offline.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <StepIndicator />

      {step === 1 && <Step1SelectStudent />}
      {step === 2 && <Step2ChooseFee />}
      {step === 3 && <Step3Checkout />}
    </div>
  );
}
