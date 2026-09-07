import axios, { AxiosError, AxiosInstance } from 'axios';

/**
 * Axios instance. Tüm client → server istekleri buradan geçer.
 *
 * Faz 0'da sadece baseURL + timeout. Faz 1'de:
 *   - request interceptor: JWT token ekleme
 *   - response interceptor: 401 → refresh → retry
 *   - error normalizasyonu (HttpError tipi)
 */

const baseURL = import.meta.env.VITE_API_URL || '/api';

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor — Faz 0'da sadece log, Faz 1'de auth handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // eslint-disable-next-line no-console
    console.error('[API Error]', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: error.message,
    });
    return Promise.reject(error);
  },
);

export default api;
