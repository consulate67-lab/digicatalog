import { NavLink } from 'react-router-dom';
import {
  Package,
  FolderTree,
  Upload,
  LayoutDashboard,
  BookOpen,
  Users,
  Plug,
} from 'lucide-react';

/**
 * Admin sidebar. Auth + AdminLayout içinde kullanılır.
 *
 * Faz 2: Products, Categories, Import
 * Faz 3: Customers (Müşteriler)
 * Faz 4: ERP Entegrasyonu
 * Faz 5+: Catalogs, Viewer
 */
const AdminSidebar = () => {
  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'
    }`;

  return (
    <aside className="w-60 flex-shrink-0 border-r border-slate-200 bg-white">
      <div className="px-4 py-5">
        <NavLink to="/" className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <BookOpen className="h-5 w-5 text-brand-600" />
          <span>DijiCatalog</span>
        </NavLink>
      </div>
      <nav className="space-y-1 px-2">
        <NavLink to="/dashboard" className={linkClass} end>
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </NavLink>

        <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Ürünler
        </div>
        <NavLink to="/admin/products" className={linkClass}>
          <Package className="h-4 w-4" />
          Ürünler
        </NavLink>
        <NavLink to="/admin/categories" className={linkClass}>
          <FolderTree className="h-4 w-4" />
          Kategoriler
        </NavLink>
        <NavLink to="/admin/products/import" className={linkClass}>
          <Upload className="h-4 w-4" />
          Toplu İçe Aktar
        </NavLink>

        <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Müşteriler
        </div>
        <NavLink to="/admin/customers" className={linkClass}>
          <Users className="h-4 w-4" />
          Müşteriler
        </NavLink>
        <NavLink to="/admin/customers/import" className={linkClass}>
          <Upload className="h-4 w-4" />
          Toplu İçe Aktar
        </NavLink>

        <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Entegrasyon
        </div>
        <NavLink to="/admin/integrations" className={linkClass}>
          <Plug className="h-4 w-4" />
          ERP Ayarları
        </NavLink>
      </nav>
    </aside>
  );
};

export default AdminSidebar;
