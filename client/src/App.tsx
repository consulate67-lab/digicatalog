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

// Faz 4: lazy-load integrations
const Integrations = lazy(() => import('./pages/admin/Integrations'));

// Faz 5: lazy-load catalogs
const Catalogs = lazy(() => import('./pages/admin/Catalogs'));
const CatalogsNew = lazy(() => import('./pages/admin/CatalogsNew'));
const CatalogsEdit = lazy(() => import('./pages/admin/CatalogsEdit'));

// Faz 6: lazy-load viewer (public, no auth)
const Viewer = lazy(() => import('./pages/Viewer'));

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

        {/* Public Viewer (no auth, customer-facing) */}
        <Route
          path="/viewer/:catalogId"
          element={
            <Suspense fallback={<PageLoader />}>
              <Viewer />
            </Suspense>
          }
        />

        {/* Admin (protected, lazy) */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route
            path="products"
            element={
              <Suspense fallback={<PageLoader />}>
                <Products />
              </Suspense>
            }
          />
          <Route
            path="products/new"
            element={
              <Suspense fallback={<PageLoader />}>
                <ProductsNew />
              </Suspense>
            }
          />
          <Route
            path="products/:id"
            element={
              <Suspense fallback={<PageLoader />}>
                <ProductsEdit />
              </Suspense>
            }
          />
          <Route
            path="products/import"
            element={
              <Suspense fallback={<PageLoader />}>
                <ProductImport />
              </Suspense>
            }
          />
          <Route
            path="categories"
            element={
              <Suspense fallback={<PageLoader />}>
                <Categories />
              </Suspense>
            }
          />
          <Route
            path="customers"
            element={
              <Suspense fallback={<PageLoader />}>
                <Customers />
              </Suspense>
            }
          />
          <Route
            path="customers/new"
            element={
              <Suspense fallback={<PageLoader />}>
                <CustomersNew />
              </Suspense>
            }
          />
          <Route
            path="customers/:id"
            element={
              <Suspense fallback={<PageLoader />}>
                <CustomersEdit />
              </Suspense>
            }
          />
          <Route
            path="customers/import"
            element={
              <Suspense fallback={<PageLoader />}>
                <CustomerImport />
              </Suspense>
            }
          />
          <Route
            path="integrations"
            element={
              <Suspense fallback={<PageLoader />}>
                <Integrations />
              </Suspense>
            }
          />
          <Route
            path="catalogs"
            element={
              <Suspense fallback={<PageLoader />}>
                <Catalogs />
              </Suspense>
            }
          />
          <Route
            path="catalogs/new"
            element={
              <Suspense fallback={<PageLoader />}>
                <CatalogsNew />
              </Suspense>
            }
          />
          <Route
            path="catalogs/:id"
            element={
              <Suspense fallback={<PageLoader />}>
                <CatalogsEdit />
              </Suspense>
            }
          />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

export default App;
