import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import ProtectedRoute from './lib/ProtectedRoute';
import { Loader2 } from 'lucide-react';

// Faz 2: lazy-load admin pages (her biri ayrı chunk olur)
const Products = lazy(() => import('./pages/admin/Products'));
const ProductsNew = lazy(() => import('./pages/admin/ProductsNew'));
const ProductsEdit = lazy(() => import('./pages/admin/ProductsEdit'));
const ProductImport = lazy(() => import('./pages/admin/ProductImport'));
const Categories = lazy(() => import('./pages/admin/Categories'));

// Faz 3: lazy-load customer pages
const Customers = lazy(() => import('./pages/admin/Customers'));
const CustomersNew = lazy(() => import('./pages/admin/CustomersNew'));
const CustomersEdit = lazy(() => import('./pages/admin/CustomersEdit'));
const CustomerImport = lazy(() => import('./pages/admin/CustomerImport'));

const PageLoader = () => (
  <div className="flex min-h-[400px] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
  </div>
);

/**
 * Route registry.
 *
 * Public: /, /login, /register
 * Protected: /dashboard, /admin/* (auth gerekli)
 *
 * Faz 3+ sonrası eklenecekler:
 *   /admin/customers, /admin/customers/new
 *   /admin/catalogs, /admin/catalogs/new, /admin/catalogs/:id
 *   /viewer/:catalogId (public, link-based)
 */
const App = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Admin (protected, lazy) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <AdminLayout />
              </Suspense>
            </ProtectedRoute>
          }
        >
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductsNew />} />
          <Route path="products/:id" element={<ProductsEdit />} />
          <Route path="products/import" element={<ProductImport />} />
          <Route path="categories" element={<Categories />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/new" element={<CustomersNew />} />
          <Route path="customers/:id" element={<CustomersEdit />} />
          <Route path="customers/import" element={<CustomerImport />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

export default App;
