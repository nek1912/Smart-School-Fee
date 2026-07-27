import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import OCRUpload from '../../components/common/OCRUpload';
import axios from 'axios';

export default function Signup({ onNavigate }) {
  const { error: authError, successMessage, loading, clearAlerts } = useAuthStore();
  
  // Guardian / Account Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    role: 'guardian',
  });
  
  // Student Form State (Only shown for Guardian role)
  const [studentData, setStudentData] = useState({
    name: '',
    class: 'Grade 5-A',
    dob: '',
  });

  // OCR KYC State
  const [docType, setDocType] = useState('aadhaar');
  const [ocrData, setOcrData] = useState(null);
  const [ocrWarning, setOcrWarning] = useState('');
  
  const [consentChecked, setConsentChecked] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [showExistingAccountOptions, setShowExistingAccountOptions] = useState(false);

  useEffect(() => {
    clearAlerts();
    setApiError(null);
  }, []);

  // Run real-time comparison between form entries and OCR extracted values
  useEffect(() => {
    if (!ocrData || formData.role !== 'guardian') {
      setOcrWarning('');
      return;
    }

    let nameMismatched = false;
    if (ocrData.name && studentData.name) {
      const getWords = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      const w1 = getWords(ocrData.name);
      const w2 = getWords(studentData.name);
      if (w1.length > 0 && w2.length > 0) {
        const [short, long] = w1.length < w2.length ? [w1, w2] : [w2, w1];
        const matches = short.filter(w => long.includes(w));
        nameMismatched = matches.length !== short.length;
      } else {
        nameMismatched = ocrData.name.toLowerCase().replace(/[^a-z0-9]/g, '') !== studentData.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      }
    }

    let dobMismatched = false;
    if (ocrData.dob && studentData.dob) {
      try {
        const d1 = new Date(ocrData.dob).toDateString();
        const d2 = new Date(studentData.dob).toDateString();
        dobMismatched = d1 !== d2;
      } catch (e) {
        dobMismatched = true;
      }
    }

    if (nameMismatched && dobMismatched) {
      setOcrWarning('⚠️ Name & DOB mismatch: Document data differs from your input. Admin verification will be required.');
    } else if (nameMismatched) {
      setOcrWarning(`⚠️ Name mismatch: Document says "${ocrData.name}". Admin verification will be required.`);
    } else if (dobMismatched) {
      setOcrWarning(`⚠️ DOB mismatch: Document says "${ocrData.dob}". Admin verification will be required.`);
    } else {
      setOcrWarning('✅ Document details verified and matched successfully!');
    }
  }, [studentData.name, studentData.dob, ocrData, formData.role]);

  const validate = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Guardian name is required';
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) errors.email = 'Enter a valid email address';

    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(formData.mobile)) errors.mobile = 'Mobile number must be exactly 10 digits';

    if (formData.password.length < 6) errors.password = 'Password must be at least 6 characters';

    if (formData.role === 'guardian') {
      if (!studentData.name.trim()) errors.studentName = 'Student name is required';
      if (!studentData.dob) errors.studentDob = 'Student date of birth is required';
      if (!ocrData) errors.ocr = 'Please scan your Aadhaar or Birth Certificate to complete Stage 1';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formErrors[e.target.name]) {
      setFormErrors({ ...formErrors, [e.target.name]: null });
    }
  };

  const handleStudentChange = (e) => {
    setStudentData({ ...studentData, [e.target.name]: e.target.value });
    if (formErrors[`student${e.target.name.charAt(0).toUpperCase() + e.target.name.slice(1)}`]) {
      setFormErrors({ ...formErrors, [`student${e.target.name.charAt(0).toUpperCase() + e.target.name.slice(1)}`]: null });
    }
  };

  const handleOCRComplete = (data) => {
    setOcrData(data);
    if (formErrors.ocr) {
      setFormErrors({ ...formErrors, ocr: null });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;
    if (!consentChecked) return;

    try {
      // 1. Trigger signup call (inserts Guardian, and Student if applicable)
      const signupPayload = {
        ...formData,
        studentName: formData.role === 'guardian' ? studentData.name : undefined,
        studentClass: formData.role === 'guardian' ? studentData.class : undefined,
        studentDob: formData.role === 'guardian' ? studentData.dob : undefined
      };

      const res = await axios.post('/api/auth/signup', signupPayload);
      
      const { user, token, student } = res.data;

      // 2. Enforce authentication tokens inside the Zustand store
      useAuthStore.setState({ token, user });
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // 3. For Guardians: Perform Stage 1 KYC document upload
      if (formData.role === 'guardian' && student) {
        // Double-mask Document Ref to last 4 digits (e.g. **** **** 1234) on Client-side for DPDP Compliance
        let maskedDocRef = null;
        if (ocrData.docRef) {
          const cleanRef = ocrData.docRef.replace(/\s/g, '');
          maskedDocRef = cleanRef.length >= 4 ? `**** **** ${cleanRef.slice(-4)}` : cleanRef;
        }

        await axios.post('/api/students/kyc', {
          studentId: student.id,
          docType,
          docRef: maskedDocRef,
          ocrData: {
            name: ocrData.name,
            dob: ocrData.dob,
            rawText: ocrData.rawText
          }
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      // 4. Navigate to dashboard
      setTimeout(() => {
        onNavigate('dashboard');
      }, 1000);
    } catch (err) {
      if (err.response?.status === 409) {
        setApiError(err.response.data.message);
        setShowExistingAccountOptions(true);
      } else {
        setApiError(err.response?.data?.error || 'Signup registration failed.');
      }
    }
  };

  return (
    <div className="auth-wrapper" style={{ minHeight: '100vh', padding: '40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel glass-panel-glow auth-card" style={{ width: '100%', maxWidth: '650px', padding: '40px' }}>
        <h1 className="logo-text">SMART SCHOOL FINTECH</h1>
        <h2 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>
          Stage 1: Identity & Registration
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
          {formData.role === 'guardian' 
            ? 'Set up your parent credentials and scan your child’s ID document to verify details.' 
            : 'Register a secure school management administrative account.'}
        </p>

        {(authError || apiError) && <div className="alert alert-error">{authError || apiError}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        {showExistingAccountOptions && (
          <div style={{ marginTop: '10px', marginBottom: '20px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button className="btn" onClick={() => onNavigate('login')}>
              Log In Instead
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('payment')}>
              Add a New Ward (Child)
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          
          {/* SECTION 1: Guardian / Account Details */}
          <div style={{ marginBottom: '25px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', fontWeight: 'bold', display: 'block', marginBottom: '15px' }}>
              SECTION 1: ACCOUNT CREDENTIALS
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  name="name"
                  className="form-input pulse-focus"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter full name"
                />
                {formErrors.name && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.name}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  name="email"
                  className="form-input pulse-focus"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="name@mail.com"
                />
                {formErrors.email && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.email}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <input
                  type="tel"
                  name="mobile"
                  className="form-input pulse-focus"
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="10-digit number"
                  maxLength="10"
                />
                {formErrors.mobile && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.mobile}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  name="password"
                  className="form-input pulse-focus"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Password"
                />
                {formErrors.password && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.password}</span>}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '15px' }}>
              <label className="form-label">Registering As</label>
              <select
                name="role"
                className="form-input pulse-focus"
                value={formData.role}
                onChange={handleChange}
                style={{ background: 'rgba(15, 23, 42, 0.8)' }}
              >
                <option value="guardian">Guardian / Parent (Requires Minor Verification)</option>
                <option value="admin">School Admin (Direct Approval)</option>
              </select>
            </div>
          </div>

          {/* SECTION 2: Student Details & KYC (Guardian role only) */}
          {formData.role === 'guardian' && (
            <div style={{ marginBottom: '25px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', fontWeight: 'bold', display: 'block', marginBottom: '15px' }}>
                SECTION 2: WARD (STUDENT) DETAILS
              </span>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div className="form-group">
                  <label className="form-label">Student Name</label>
                  <input
                    type="text"
                    name="name"
                    className="form-input pulse-focus"
                    value={studentData.name}
                    onChange={handleStudentChange}
                    placeholder="Child's full name"
                  />
                  {formErrors.studentName && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.studentName}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Academic Class</label>
                  <select
                    name="class"
                    className="form-input pulse-focus"
                    value={studentData.class}
                    onChange={handleStudentChange}
                    style={{ background: 'rgba(15, 23, 42, 0.8)' }}
                  >
                    <option value="Grade 1-A">Grade 1-A</option>
                    <option value="Grade 2-C">Grade 2-C</option>
                    <option value="Grade 5-A">Grade 5-A</option>
                    <option value="Grade 10-B">Grade 10-B</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input
                    type="date"
                    name="dob"
                    className="form-input pulse-focus"
                    value={studentData.dob}
                    onChange={handleStudentChange}
                  />
                  {formErrors.studentDob && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.studentDob}</span>}
                </div>
              </div>

              {/* Document Selection and Scanner */}
              <div className="form-group">
                <label className="form-label">KYC Verification Document</label>
                <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
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
              {formErrors.ocr && <span style={{ color: 'var(--error)', fontSize: '0.75rem', display: 'block', marginTop: '5px' }}>{formErrors.ocr}</span>}

              {/* OCR Mismatch Warnings */}
              {ocrWarning && (
                <div 
                  className="alert" 
                  style={{ 
                    marginTop: '15px', 
                    padding: '12px', 
                    fontSize: '0.8rem',
                    background: ocrWarning.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: ocrWarning.startsWith('✅') ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)',
                    color: ocrWarning.startsWith('✅') ? '#10b981' : '#f87171'
                  }}
                >
                  {ocrWarning}
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: DPDP Consent Checkbox */}
          <div className="form-group" style={{ marginTop: '24px', marginBottom: '24px' }}>
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              <span className="checkmark"></span>
              <span style={{ fontSize: '0.8rem', color: consentChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                <strong>DPDP Act 2023 Consent:</strong> I explicitly consent to the collection and processing of my ward's educational, financial, and personal minor data for school fee administration.
              </span>
            </label>
          </div>

          <button
            type="submit"
            className="btn"
            style={{ width: '100%', padding: '14px' }}
            disabled={!consentChecked || loading}
          >
            {loading ? 'Processing Registration...' : 'Agree & Register Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); onNavigate('login'); }}
            style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
          >
            Log In
          </a>
        </p>
      </div>
    </div>
  );
}
