import { create } from 'zustand';
import { api, setAuthToken, normalizeApiError } from '../api/client';

const storedToken = localStorage.getItem('token');
const storedUser = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null;

if (storedToken) {
  setAuthToken(storedToken);
}

export const useAuthStore = create((set, get) => ({
  user: storedUser,
  token: storedToken,
  tempMobile: null,
  receivedOtp: null,
  loading: false,
  error: null,
  successMessage: null,

  clearAlerts: () => set({ error: null, successMessage: null }),

  login: async (mobile, password) => {
    set({ loading: true, error: null, successMessage: null });
    try {
      const response = await api.post('/auth/login', { mobile, password });
      set({ tempMobile: mobile, receivedOtp: response.data.otp || null, loading: false, successMessage: response.data.message });
      return { status: 'otp_sent' };
    } catch (err) {
      const errorMsg = normalizeApiError(err);
      set({ loading: false, error: errorMsg });
      throw new Error(errorMsg);
    }
  },

  verifyOtp: async (otp) => {
    set({ loading: true, error: null });
    const { tempMobile } = get();
    try {
      const response = await api.post('/auth/verify-otp', { mobile: tempMobile, otp });
      const { user, token } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setAuthToken(token);

      set({ user, token, tempMobile: null, receivedOtp: null, loading: false });
      return user;
    } catch (err) {
      const errorMsg = normalizeApiError(err);
      set({ loading: false, error: errorMsg });
      throw new Error(errorMsg);
    }
  },

  signup: async (name, email, mobile, password, role) => {
    set({ loading: true, error: null, successMessage: null });
    try {
      const response = await api.post('/auth/signup', { name, email, mobile, password, role });
      const { user, token } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setAuthToken(token);

      set({ user, token, loading: false, successMessage: 'Account created successfully!' });
      return user;
    } catch (err) {
      const errorMsg = normalizeApiError(err);
      set({ loading: false, error: errorMsg });
      throw new Error(errorMsg);
    }
  },

  forgotPassword: async (mobile) => {
    set({ loading: true, error: null, successMessage: null });
    try {
      const response = await api.post('/auth/forgot-password', { mobile });
      set({ tempMobile: mobile, receivedOtp: response.data.otp || null, loading: false, successMessage: response.data.message });
      return true;
    } catch (err) {
      const errorMsg = normalizeApiError(err);
      set({ loading: false, error: errorMsg });
      throw new Error(errorMsg);
    }
  },

  resetPassword: async (otp, newPassword) => {
    set({ loading: true, error: null });
    const { tempMobile } = get();
    try {
      await api.post('/auth/reset-password', { mobile: tempMobile, otp, newPassword });
      set({ tempMobile: null, receivedOtp: null, loading: false, successMessage: 'Password updated successfully. Please log in.' });
      return true;
    } catch (err) {
      const errorMsg = normalizeApiError(err);
      set({ loading: false, error: errorMsg });
      throw new Error(errorMsg);
    }
  },

  submitConsent: async (studentId, consent) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/auth/consent', { studentId, consent });
      set({ loading: false, successMessage: response.data.message });
      return response.data.student;
    } catch (err) {
      const errorMsg = normalizeApiError(err);
      set({ loading: false, error: errorMsg });
      throw new Error(errorMsg);
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuthToken(null);
    set({ user: null, token: null, tempMobile: null, receivedOtp: null, error: null, successMessage: null });
  }
}));