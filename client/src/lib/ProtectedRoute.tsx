import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'member';
}

/**
 * Route guard. Auth kontrolü + opsiyonel rol kontrolü.
 *
 * - isAuthenticated false → /login'e yönlendir (mevcut path state'te)
 * - requiredRole verildi ve uyuşmuyorsa → /dashboard'a yönlendir
 * - Yükleniyorsa spinner göster (Faz 1'de kullanılmıyor, ileride lazım)
 */
const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
