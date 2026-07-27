import React, { useState } from 'react';
import { api } from '../../api/client';
import OCRUpload from '../../components/common/OCRUpload';

export default function AddWard({ show, onClose, onSuccess }) {
  const [wardForm, setWardForm] = useState({ name: '', class: 'Grade 1-A', dob: '' });
  const [addingWard, setAddingWard] = useState(false);
  const [wardError, setWardError] = useState(null);
  const [docType, setDocType] = useState('aadhaar');
  const [ocrData, setOcrData] = useState(null);

  if (!show) return null;

  const handleChange = (e) => {
    setWardForm({ ...wardForm, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAddingWard(true);
    setWardError(null);
    try {
      const res = await api.post('/guardians/students', wardForm);
      const student = res.data.student;

      if (ocrData && student) {
        let maskedDocRef = null;
        if (ocrData.docRef) {
          const cleanRef = ocrData.docRef.replace(/\s/g, '');
          maskedDocRef = cleanRef.length >= 4 ? `**** **** ${cleanRef.slice(-4)}` : cleanRef;
        }
        await api.post('/students/kyc', {
          studentId: student.id,
          docType,
          docRef: maskedDocRef,
          ocrData: {
            name: ocrData.name,
            dob: ocrData.dob,
            rawText: ocrData.rawText
          }
        });
      }

      setWardForm({ name: '', class: 'Grade 1-A', dob: '' });
      setOcrData(null);
      onSuccess();
      onClose();
    } catch (err) {
      setWardError(err.response?.data?.error || 'Failed to add ward');
    } finally {
      setAddingWard(false);
    }
  };

  const handleClose = () => {
    setWardError(null);
    setOcrData(null);
    setWardForm({ name: '', class: 'Grade 1-A', dob: '' });
    onClose();
  };

  const handleOCRComplete = (data) => {
    setOcrData(data);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }} onClick={handleClose}>
      <div className="glass-panel" style={{
        width: '100%', maxWidth: '520px', padding: '30px',
        borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto'
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: '20px', fontSize: '1.1rem' }}>+ Add New Ward</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label className="form-label">Student Name</label>
            <input
              type="text"
              name="name"
              className="form-input pulse-focus"
              value={wardForm.name}
              onChange={handleChange}
              placeholder="Enter full name"
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label className="form-label">Class</label>
            <select
              name="class"
              className="form-input pulse-focus"
              value={wardForm.class}
              onChange={handleChange}
              style={{ background: 'rgba(15, 23, 42, 0.8)' }}
            >
              <option value="Grade 1-A">Grade 1-A</option>
              <option value="Grade 2-C">Grade 2-C</option>
              <option value="Grade 5-A">Grade 5-A</option>
              <option value="Grade 10-B">Grade 10-B</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label className="form-label">Date of Birth</label>
            <input
              type="date"
              name="dob"
              className="form-input pulse-focus"
              value={wardForm.dob}
              onChange={handleChange}
              required
            />
          </div>

          <div style={{ marginBottom: '20px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', fontWeight: 'bold', display: 'block', marginBottom: '15px' }}>
              KYC DOCUMENT (OPTIONAL)
            </span>
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label className="form-label">Document Type</label>
              <div style={{ display: 'flex', gap: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem' }}>
                  <input
                    type="radio"
                    name="docType"
                    checked={docType === 'aadhaar'}
                    onChange={() => setDocType('aadhaar')}
                  />
                  Aadhaar Card
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem' }}>
                  <input
                    type="radio"
                    name="docType"
                    checked={docType === 'birth_certificate'}
                    onChange={() => setDocType('birth_certificate')}
                  />
                  Birth Certificate
                </label>
              </div>
            </div>
            <OCRUpload docType={docType} onOCRComplete={handleOCRComplete} />
          </div>

          {wardError && (
            <div className="alert alert-error" style={{ marginBottom: '15px' }}>{wardError}</div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={addingWard}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={addingWard}>
              {addingWard ? 'Adding...' : 'Add Ward'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}