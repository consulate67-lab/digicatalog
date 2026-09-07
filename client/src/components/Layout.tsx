import { Outlet, Link, useNavigate } from 'react-router-dom';
import { BookOpen, LogIn, LayoutDashboard, LogOut, User } from 'lucide-react';
import { useAuthStore } from '../store/auth';

/**
 * App shell. Header + main + footer. Tüm sayfalar Layout içinde render olur.
 *
 * Auth durumuna göre header değişir:
 * - Login değil: "Giriş Yap" butonu
 * - Login: User menüsü (ad + çıkış)
 *
 * Faz 2'den itibaren sidebar (products, customers, catalogs) eklenecek.
 */
const Layout = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, clear } = useAuthStore();

  const handleLogout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BookOpen className="h-6 w-6 text-brand-600" />
            <span>DijiCatalog</span>
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
              v1.0
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
                  <span>Dashboard</span>
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
                  Çıkış
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">
                  <LogIn className="h-4 w-4" />
                  Giriş Yap
                </Link>
                <Link to="/register" className="btn-primary">
                  Kayıt Ol
                </Link>
              </>
            )}
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
          © 2026 DijiCatalog. Tüm hakları saklıdır.
        </div>
      </footer>
    </div>
  );
};

export default Layout;
