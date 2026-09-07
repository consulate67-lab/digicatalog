import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-24 text-center">
      <FileQuestion className="h-16 w-16 text-slate-300" />
      <h1 className="mt-4 text-3xl font-bold text-slate-900">404</h1>
      <p className="mt-2 text-slate-600">Aradığınız sayfa bulunamadı.</p>
      <Link to="/" className="btn-primary mt-6">
        Ana Sayfaya Dön
      </Link>
    </div>
  );
};

export default NotFound;
