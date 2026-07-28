import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';

export default function Login({ onNavigate }) {
  const { login, verifyOtp, error, successMessage, loading, tempMobile, receivedOtp, clearAlerts } = useAuthStore();
  const [step, setStep] = useState(1); // 1 = Password, 2 = OTP
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    clearAlerts();
    if (tempMobile) {
      setStep(2);
    } else {
      setStep(1);
    }
  }, [tempMobile]);

  const validatePasswordStep = () => {
    const errors = {};
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobile)) errors.mobile = 'Mobile number must be exactly 10 digits';
    if (!password) errors.password = 'Password is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!validatePasswordStep()) return;

    try {
      await login(mobile, password);
      // Success will update tempMobile and trigger useEffect to step 2
    } catch (err) {
      // Handled by store
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 4) {
      setFormErrors({ otp: 'OTP must be exactly 4 digits' });
      return;
    }

    try {
      await verifyOtp(otp);
      onNavigate('dashboard');
    } catch (err) {
      // Handled by store
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="glass-panel glass-panel-glow auth-card">
        <h1 className="logo-text">SMART SCHOOL FINTECH</h1>
        <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>
          {step === 1 ? 'Log In to Account' : '2-Factor OTP Verification'}
        </h2>

        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        {step === 1 ? (
          <form onSubmit={handlePasswordSubmit}>
            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <input
                type="tel"
                className="form-input pulse-focus"
                placeholder="10-digit mobile number"
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value);
                  setFormErrors({ ...formErrors, mobile: null });
                }}
                maxLength="10"
              />
              {formErrors.mobile && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.mobile}</span>}
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Password</label>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onNavigate('forgot-password'); }}
                  style={{ color: 'var(--primary)', fontSize: '0.75rem', textDecoration: 'none' }}
                >
                  Forgot password?
                </a>
              </div>
              <input
                type="password"
                className="form-input pulse-focus"
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFormErrors({ ...formErrors, password: null });
                }}
              />
              {formErrors.password && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.password}</span>}
            </div>

            <button
              type="submit"
              className="btn"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Next Step'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '20px', textAlign: 'center' }}>
              We have sent a security code to <strong>{tempMobile}</strong>.
            </p>

            {receivedOtp ? (
              <div className="alert alert-success" style={{ background: 'rgba(6, 182, 212, 0.12)', borderColor: 'rgba(6, 182, 212, 0.3)', color: '#22d3ee', textAlign: 'center', marginBottom: '20px' }}>
                <strong>[Dev Mode] Mock OTP:</strong>
                <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '4px', marginTop: '5px' }}>
                  {receivedOtp}
                </span>
              </div>
            ) : (
              <div className="alert alert-success" style={{ background: 'rgba(6, 182, 212, 0.12)', borderColor: 'rgba(6, 182, 212, 0.3)', color: '#22d3ee', textAlign: 'center', marginBottom: '20px' }}>
                <strong>OTP Sent!</strong>
                <span style={{ display: 'block', fontSize: '0.875rem', marginTop: '5px' }}>
                  Please check your phone for the 4-digit code.
                </span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Enter 4-Digit OTP</label>
              <input
                type="text"
                className="form-input pulse-focus"
                placeholder="e.g. 1234"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value);
                  setFormErrors({ ...formErrors, otp: null });
                }}
                maxLength="4"
                style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '1.25rem' }}
              />
              {formErrors.otp && <span style={{ color: 'var(--error)', fontSize: '0.75rem', display: 'block', textAlign: 'center' }}>{formErrors.otp}</span>}
            </div>

            <button
              type="submit"
              className="btn"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Verify & Log In'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '12px' }}
              onClick={() => {
                useAuthStore.setState({ tempMobile: null });
                setStep(1);
              }}
            >
              Back to Password
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Don't have an account?{' '}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); onNavigate('signup'); }}
            style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
          >
            Sign Up
          </a>
        </p>
      </div>
    </div>
  );
}
