import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000
});

export const setAuthToken = (token) => {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
};

export const normalizeApiError = (error) => {
  return error.response?.data?.error || error.message || 'Request failed';
};