import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';

/**
 * Admin panel shell: sidebar + main content.
 * Tüm /admin/* route'ları bu layout içinde.
 */
const AdminLayout = () => {
  return (
    <div className="flex min-h-[calc(100vh-65px)]">
      <AdminSidebar />
      <main className="flex-1 overflow-x-auto bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
