import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

/**
 * Route registry. Faz 0'da sadece landing + 404.
 * Faz 1'den itibaren /login, /dashboard, /products, /customers, /catalogs, /viewer/:id eklenecek.
 *
 * Lazy-load edilen sayfalar Faz 2'den itibaren React.lazy ile sarılacak.
 */
const App = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

export default App;
