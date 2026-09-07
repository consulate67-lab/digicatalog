import { Outlet, Link } from 'react-router-dom';
import { BookOpen, Github } from 'lucide-react';

/**
 * App shell. Header + main + footer. Tüm sayfalar Layout içinde render olur.
 *
 * Faz 0'da minimal (logo + GitHub link + footer).
 * Faz 1'den itibaren:
 *   - Kullanıcı menüsü (auth context'ten)
 *   - Tenant switcher (super_admin için)
 *   - Sidebar (products, customers, catalogs)
 */
const Layout = () => {
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
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <a
              href="https://github.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-slate-900"
            >
              <Github className="h-4 w-4" />
              <span>Repo</span>
            </a>
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
