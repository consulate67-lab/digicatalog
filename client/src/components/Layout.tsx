import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, LogIn, LayoutDashboard, LogOut, User, Globe } from 'lucide-react';
import { useAuthStore } from '../store/auth';

/**
 * App shell. Header + main + footer. Tüm sayfalar Layout içinde render olur.
 *
 * Auth durumuna göre header değişir:
 * - Login değil: "Giriş Yap" butonu + dil seçici
 * - Login: User menüsü (ad + çıkış) + dil seçici
 *
 * Dil seçici: TR/EN toggle, localStorage'a persist edilir (i18n/config.ts).
 */
const Layout = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, user, clear } = useAuthStore();

  const handleLogout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  const toggleLanguage = () => {
    const next = i18n.language.startsWith('tr') ? 'en' : 'tr';
    i18n.changeLanguage(next);
  };

  const currentLang = i18n.language.startsWith('en') ? 'EN' : 'TR';

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BookOpen className="h-6 w-6 text-brand-600" />
            <span>{t('common.appName')}</span>
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
              {t('common.version')}
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm text-slate-600">
            {isAuthenticated && user ? (
              <>
                <Link
                  to="/dashboard"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors hover:bg-slate-100"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>{t('common.dashboard')}</span>
                </Link>
                <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5">
                  <User className="h-4 w-4 text-slate-500" />
                  <span className="font-medium text-slate-700">{user.name}</span>
                  <span className="rounded bg-white px-1.5 py-0.5 text-xs font-medium text-slate-500">
                    {user.role}
                  </span>
                </div>
                <button onClick={handleLogout} className="btn-secondary">
                  <LogOut className="h-4 w-4" />
                  {t('common.logout')}
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">
                  <LogIn className="h-4 w-4" />
                  {t('common.login')}
                </Link>
                <Link to="/register" className="btn-primary">
                  {t('common.register')}
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              aria-label="Language switcher"
              title="TR / EN"
            >
              <Globe className="h-3.5 w-3.5" />
              {currentLang}
            </button>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 text-sm text-slate-500">
          {t('footer.copyright')}
        </div>
      </footer>
    </div>
  );
};

export default Layout;
