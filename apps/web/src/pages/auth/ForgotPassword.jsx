import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';

export default function ForgotPassword({ onNavigate }) {
  const { forgotPassword, resetPassword, error, successMessage, loading, tempMobile, receivedOtp, clearAlerts } = useAuthStore();
  const [step, setStep] = useState(1); // 1 = Mobile, 2 = Reset
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    clearAlerts();
    if (tempMobile) {
      setStep(2);
    } else {
      setStep(1);
    }
  }, [tempMobile]);

  const handleMobileSubmit = async (e) => {
    e.preventDefault();
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobile)) {
      setFormErrors({ mobile: 'Enter a valid 10-digit mobile number' });
      return;
    }

    try {
      await forgotPassword(mobile);
      // Store will set tempMobile and trigger step 2
    } catch (err) {
      // Handled by store
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (otp.length !== 4) errors.otp = 'OTP must be exactly 4 digits';
    if (newPassword.length < 6) errors.newPassword = 'Password must be at least 6 characters';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      await resetPassword(otp, newPassword);
      // Wait a moment and redirect to login
      setTimeout(() => {
        useAuthStore.setState({ tempMobile: null });
        onNavigate('login');
      }, 1500);
    } catch (err) {
      // Handled by store
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="glass-panel glass-panel-glow auth-card">
        <h1 className="logo-text">SMART SCHOOL FINTECH</h1>
        <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '1.25rem', color: 'var(--text-secondary)' }}>
          {step === 1 ? 'Reset Password' : 'Enter New Password'}
        </h2>

        {error && <div className="alert alert-error">{error}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        {step === 1 ? (
          <form onSubmit={handleMobileSubmit}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '20px', textAlign: 'center' }}>
              Enter your registered mobile number below, and we will send you an OTP to reset your password.
            </p>

            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <input
                type="tel"
                className="form-input pulse-focus"
                placeholder="10-digit mobile number"
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value);
                  setFormErrors({});
                }}
                maxLength="10"
              />
              {formErrors.mobile && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.mobile}</span>}
            </div>

            <button
              type="submit"
              className="btn"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={loading}
            >
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetSubmit}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '20px', textAlign: 'center' }}>
              OTP code sent to <strong>{tempMobile}</strong>.
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
              <label className="form-label">4-Digit OTP</label>
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
              {formErrors.otp && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.otp}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input pulse-focus"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setFormErrors({ ...formErrors, newPassword: null });
                }}
              />
              {formErrors.newPassword && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{formErrors.newPassword}</span>}
            </div>

            <button
              type="submit"
              className="btn"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={loading}
            >
              {loading ? 'Resetting Password...' : 'Reset Password'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Back to{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              useAuthStore.setState({ tempMobile: null });
              onNavigate('login');
            }}
            style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
          >
            Log In
          </a>
        </p>
      </div>
    </div>
  );
}
