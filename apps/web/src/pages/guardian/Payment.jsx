import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PaymentButton from '../../components/common/PaymentButton';

export default function Payment() {
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 1. Fetch wards
  useEffect(() => {
    const fetchWards = async () => {
      try {
        const res = await axios.get('/api/guardians/students');
        setStudents(res.data);
        if (res.data.length > 0) {
          setSelectedStudentId(res.data[0].id.toString());
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch linked student details.');
      }
    };
    fetchWards();
  }, []);

  // 2. Fetch assignments when selected ward changes
  useEffect(() => {
    if (!selectedStudentId) return;
    const fetchAssignments = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/fees/assignments?studentId=${selectedStudentId}`);
        setAssignments(res.data);
      } catch (err) {
        console.error(err);
        setError('Failed to load fee assignments.');
      } finally {
        setLoading(false);
      }
    };
    fetchAssignments();
  }, [selectedStudentId]);

  const handleDownloadReceipt = async (assignmentId) => {
    try {
      // Find the success transaction for this assignment
      const txRes = await axios.get('/api/payments/transactions');
      const tx = txRes.data.find(t => t.feeAssignmentId === assignmentId && t.status === 'success');
      if (!tx) {
        alert('Receipt document is being generated. Please check back in a moment.');
        return;
      }
      
      const receiptRes = await axios.get(`/api/payments/receipt?transaction_id=${tx.id}`);
      const link = document.createElement('a');
      link.href = receiptRes.data.receiptUrl;
      link.download = `Receipt-${tx.receiptNumber || 'Payment'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert('Failed to retrieve receipt.');
    }
  };

  const selectedStudent = students.find(s => s.id.toString() === selectedStudentId);

  const adjustedAmount = (asg) => {
    const base = Number(asg.feeStructure.amount);
    return (asg.waiverPenalties || []).reduce((total, item) => {
      if (item.status !== 'approved') return total;
      return item.type === 'penalty' ? total + Number(item.amount) : total - Number(item.amount);
    }, base);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      
      {/* Ward Selector Section */}
      <div className="glass-panel" style={{ padding: '30px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '15px' }}>Select Student Profile</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.875rem' }}>
          Select one of your linked children to view outstanding school fees and clear transactions.
        </p>

        {students.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No registered student records found.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {students.map(s => (
              <button
                key={s.id}
                type="button"
                className={`btn ${selectedStudentId === s.id.toString() ? '' : 'btn-secondary'}`}
                style={{ padding: '10px 24px', borderRadius: '10px', fontSize: '0.85rem' }}
                onClick={() => setSelectedStudentId(s.id.toString())}
              >
                {s.name} ({s.class})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Outstanding Fees Panel */}
      {selectedStudent && (
        <div className="glass-panel" style={{ padding: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem' }}>Fee Ledger: {selectedStudent.name}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                Verify minor details and process payments safely. UPI transactions are zero-fee under NPCI guidelines.
              </p>
            </div>
            <span className={`badge ${selectedStudent.status === 'active' ? 'badge-active' : 'badge-pending'}`} style={{ textTransform: 'capitalize' }}>
              KYC Status: {selectedStudent.status}
            </span>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Loading assigned fee schedules...
            </div>
          ) : assignments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              No outstanding fees have been assigned to {selectedStudent.name} for the active term.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '15px' }}>Fee Component</th>
                    <th style={{ padding: '15px' }}>Academic Term</th>
                    <th style={{ padding: '15px' }}>Amount Due</th>
                    <th style={{ padding: '15px' }}>Due Date</th>
                    <th style={{ padding: '15px' }}>Payment Status</th>
                    <th style={{ padding: '15px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((asg) => {
                    const isOverdue = new Date(asg.dueDate) < new Date() && asg.status !== 'paid';
                    return (
                      <tr key={asg.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '15px', fontWeight: 600 }}>{asg.feeStructure.name}</td>
                        <td style={{ padding: '15px', color: 'var(--text-secondary)' }}>
                          Term {asg.feeStructure.academicYear.label}
                        </td>
                        <td style={{ padding: '15px', fontWeight: 700, color: 'white' }}>
                          ₹{Number(adjustedAmount(asg)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '15px', color: isOverdue ? 'var(--error)' : 'var(--text-secondary)' }}>
                          {new Date(asg.dueDate).toLocaleDateString()} {isOverdue && '(Overdue)'}
                        </td>
                        <td style={{ padding: '15px' }}>
                          <span className={`badge ${asg.status === 'paid' ? 'badge-active' : 'badge-pending'}`} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                            {asg.status}
                          </span>
                        </td>
                        <td style={{ padding: '15px', textAlign: 'right' }}>
                          {asg.status === 'paid' ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                              onClick={() => handleDownloadReceipt(asg.id)}
                            >
                              Download Receipt (PDF)
                            </button>
                          ) : (
                            <PaymentButton 
                              feeAssignmentId={asg.id} 
                              amount={adjustedAmount(asg)} 
                              disabled={selectedStudent.status !== 'active'}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
