import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import ProtectedRoute from './lib/ProtectedRoute';

/**
 * Route registry.
 *
 * Public: /, /login, /register
 * Protected: /dashboard (auth gerekli, Layout header'ında user menüsü)
 *
 * Faz 2'den itibaren:
 *   /products, /products/new, /products/:id
 *   /customers, /customers/new
 *   /catalogs, /catalogs/new, /catalogs/:id
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

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

export default App;
