import { useState, FormEvent } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookOpen, Loader2, AlertCircle, Info } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore, type AuthTokens, type User, type Tenant } from '../store/auth';

interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

/**
 * Login sayfası. Email + password → /api/auth/login.
 *
 * Başarılı → store'a setAuth + /dashboard'a yönlendir
 * Hata → inline mesaj (i18n, kullanıcı dostu)
 *
 * Demo bilgileri kart olarak gösterilir (kullanıcı manuel girer).
 */
const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const from = (location.state as { from?: string } | null)?.from || '/dashboard';

  const loginMutation = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await api.post<LoginResponse>('/auth/login', input);
      return res.data;
    },
    onSuccess: async (data) => {
      setAuth({ user: data.user, tokens: data.tokens });

      // Tenant bilgisini /me'den çek
      try {
        const meRes = await api.get<{ user: User; tenant: Tenant }>('/auth/me');
        setAuth({ user: meRes.data.user, tenant: meRes.data.tenant, tokens: data.tokens });
      } catch {
        // Tenant fetch başarısız olsa da login geçerli
      }

      navigate(from, { replace: true });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  const errorMessage = loginMutation.error
    ? (loginMutation.error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message || t('login.errors.generic')
    : null;

  const fillDemo = () => {
    setEmail(t('login.demoEmail'));
    setPassword(t('login.demoPassword'));
  };

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <BookOpen className="mx-auto h-10 w-10 text-brand-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">{t('login.title')}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {t('login.subtitle')}{' '}
            <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
              {t('login.registerLink')}
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card mt-8 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              {t('login.email')}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={t('login.emailPlaceholder')}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              {t('login.password')}
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={t('login.passwordPlaceholder')}
            />
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="btn-primary w-full"
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('login.submitting')}
              </>
            ) : (
              t('login.submit')
            )}
          </button>

          {/* Demo bilgileri kartı */}
          <div className="mt-4 rounded-md border border-brand-200 bg-brand-50 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 flex-shrink-0 text-brand-600" />
              <div className="flex-1 text-xs text-brand-900">
                <div className="font-semibold">{t('login.demoHint')}:</div>
                <div className="mt-1 font-mono">
                  {t('login.demoEmail')} / {t('login.demoPassword')}
                </div>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="mt-2 inline-flex items-center rounded border border-brand-300 bg-white px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                >
                  Doldur
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
