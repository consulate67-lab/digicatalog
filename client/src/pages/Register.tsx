import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookOpen, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore, type AuthTokens, type User, type Tenant } from '../store/auth';

interface RegisterResponse {
  user: User;
  tenant: Tenant;
  tokens: AuthTokens;
}

/**
 * Register sayfası. Yeni tenant + admin user oluşturur.
 *
 * Form: tenantName, tenantSlug, email, password, name
 * - Slug otomatik önerilir (tenantName'den türetilir)
 * - Şifre 8+ karakter zorunlu
 * - Başarılı → /dashboard'a yönlendir
 */
const Register = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [form, setForm] = useState({
    tenantName: '',
    tenantSlug: '',
    email: '',
    password: '',
    name: '',
  });

  // tenantName değişince slug otomatik öner (eğer slug boşsa veya daha önce otomatik doldurulmuşsa)
  const [slugAutoFilled, setSlugAutoFilled] = useState(true);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'tenantName' && slugAutoFilled) {
        next.tenantSlug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 50);
      }
      if (field === 'tenantSlug') {
        setSlugAutoFilled(false);
      }
      return next;
    });
  };

  const registerMutation = useMutation({
    mutationFn: async (input: typeof form) => {
      const res = await api.post<RegisterResponse>('/auth/register', input);
      return res.data;
    },
    onSuccess: (data) => {
      setAuth({ user: data.user, tenant: data.tenant, tokens: data.tokens });
      navigate('/dashboard', { replace: true });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(form);
  };

  const errorMessage = registerMutation.error
    ? (registerMutation.error as { response?: { data?: { message?: string; details?: Record<string, string[]> } } })
        ?.response?.data?.message || t('register.errors.generic')
    : null;

  const fieldErrors = (registerMutation.error as { response?: { data?: { details?: Record<string, string[]> } } })
    ?.response?.data?.details;

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <BookOpen className="mx-auto h-10 w-10 text-brand-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">{t('register.title')}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {t('register.subtitle')}{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              {t('register.loginLink')}
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
            <label htmlFor="tenantName" className="block text-sm font-medium text-slate-700">
              {t('register.companyName')}
            </label>
            <input
              id="tenantName"
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={form.tenantName}
              onChange={(e) => updateField('tenantName', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={t('register.companyPlaceholder')}
            />
            {fieldErrors?.tenantName && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.tenantName[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="tenantSlug" className="block text-sm font-medium text-slate-700">
              {t('register.slug')}
              <span className="ml-1 text-xs font-normal text-slate-500">
                {t('register.slugHint')}
              </span>
            </label>
            <input
              id="tenantSlug"
              type="text"
              required
              minLength={2}
              maxLength={50}
              value={form.tenantSlug}
              onChange={(e) => updateField('tenantSlug', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={t('register.slugPlaceholder')}
            />
            {slugAutoFilled && form.tenantSlug && (
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <CheckCircle2 className="h-3 w-3" />
                {t('register.slugAutoFilled')}
              </p>
            )}
            {fieldErrors?.tenantSlug && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.tenantSlug[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              {t('register.name')}
            </label>
            <input
              id="name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={t('register.namePlaceholder')}
            />
            {fieldErrors?.name && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.name[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              {t('register.email')}
            </label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={t('register.emailPlaceholder')}
            />
            {fieldErrors?.email && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.email[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              {t('register.password')}
              <span className="ml-1 text-xs font-normal text-slate-500">
                {t('register.passwordHint')}
              </span>
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={t('login.passwordPlaceholder')}
            />
            {fieldErrors?.password && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.password[0]}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="btn-primary w-full"
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('register.submitting')}
              </>
            ) : (
              t('register.submit')
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Register;
