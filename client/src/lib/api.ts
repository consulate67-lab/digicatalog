import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth';

/**
 * Axios instance. Tüm client → server istekleri buradan geçer.
 *
 * Request interceptor:
 *   - Zustand store'dan accessToken al, Authorization header ekle
 *
 * Response interceptor:
 *   - 401 + access token var → refresh token ile yeni access al
 *   - Refresh başarılı → orijinal isteği retry
 *   - Refresh başarısız → auth.clear() + /login'e yönlendir
 *   - Diğer hatalar → logla, throw
 */

const baseURL = import.meta.env.VITE_API_URL || '/api';

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// === Request interceptor: JWT ekle ===
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { tokens } = useAuthStore.getState();
    if (tokens?.accessToken) {
      config.headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// === Response interceptor: 401 refresh ===
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null): void => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // 401 + daha önce retry yapılmamış + refresh endpoint'i değil
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/')
    ) {
      if (isRefreshing) {
        // Başka bir istek zaten refresh yapıyor, kuyruğa ekle
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          const { tokens } = useAuthStore.getState();
          if (tokens?.accessToken) {
            originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
          }
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const { tokens, clear } = useAuthStore.getState();

      if (!tokens?.refreshToken) {
        // Refresh token yok, çıkış yap
        clear();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      try {
        // Yeni token al
        const { data } = await axios.post(`${baseURL}/auth/refresh`, {
          refreshToken: tokens.refreshToken,
        });

        const newTokens = data.tokens as { accessToken: string; refreshToken: string };
        useAuthStore.getState().setTokens(newTokens);
        processQueue(null, newTokens.accessToken);

        // Orijinal isteği yeni token ile tekrar dene
        originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clear();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Diğer hatalar
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
