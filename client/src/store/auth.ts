import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Auth state — Zustand + localStorage persist.
 *
 * Tokens localStorage'da saklanır (XSS'e karşı HttpOnly cookie daha
 * güvenli olurdu, ama Faz 1'de simplicity tercih edildi. Faz 8'de
 * HttpOnly cookie + CSRF token'a geçiş yapılabilir).
 *
 * Auth flow:
 * 1) login() → /api/auth/login → { user, tokens } → state set + persist
 * 2) her API call'da axios interceptor accessToken'ı Authorization
 *    header'a ekler
 * 3) 401 alındığında refresh token ile /api/auth/refresh dener
 * 4) refresh de başarısız → state temizle + /login'e yönlendir
 */

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setAuth: (data: { user: User; tenant?: Tenant; tokens: AuthTokens }) => void;
  setUser: (user: User, tenant: Tenant) => void;
  setTokens: (tokens: AuthTokens) => void;
  clear: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tenant: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,

      setAuth: ({ user, tenant, tokens }) =>
        set({
          user,
          tenant: tenant ?? null,
          tokens,
          isAuthenticated: true,
          isLoading: false,
        }),

      setUser: (user, tenant) => set({ user, tenant }),

      setTokens: (tokens) => set({ tokens }),

      clear: () =>
        set({
          user: null,
          tenant: null,
          tokens: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'digicatalog-auth',
      // Sadece bunları persist et (isLoading geçici)
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
