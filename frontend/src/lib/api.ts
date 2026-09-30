import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // send cookies (JWT)
});

export default api;
