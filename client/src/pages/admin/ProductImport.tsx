import { useState, useRef, ChangeEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Upload, FileSpreadsheet, FileCode, CheckCircle2, XCircle, AlertCircle, Download } from 'lucide-react';
import api from '../../lib/api';

interface ImportResult {
  total: number;
  added: number;
  skipped: number;
  errors: Array<{ row: number; sku?: string; message: string }>;
}

type Format = 'excel' | 'xml';

/**
 * Toplu ürün import wizard.
 *
 * Adımlar:
 * 1) Format seç (Excel / XML) + dosya yükle
 * 2) Import çalıştır, sonuçları göster
 *
 * Sonuç ekranı: added/skipped özeti + hatalar (row + sku + message)
 */
const ProductImport = () => {
  const [format, setFormat] = useState<Format>('excel');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: async (input: { format: Format; file: File }) => {
      const formData = new FormData();
      formData.append('file', input.file);
      const res = await api.post<{ data: ImportResult }>(
        `/products/import/${input.format}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: (data) => setResult(data),
  });

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setResult(null);
  };

  const handleImport = () => {
    if (file) importMutation.mutate({ format, file });
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Toplu Ürün İçe Aktar</h1>
        <p className="mt-1 text-sm text-slate-600">
          Excel (.xlsx) veya XML dosyasından toplu ürün yükleyin. İlk satır başlık olmalı.
        </p>
      </div>

      {!result ? (
        <div className="card max-w-2xl">
          {/* Format seçimi */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormat('excel')}
              className={`flex items-center gap-3 rounded-md border-2 p-4 text-left transition-colors ${
                format === 'excel'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
              <div>
                <p className="font-semibold text-slate-900">Excel</p>
                <p className="text-xs text-slate-500">.xlsx, .xls</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFormat('xml')}
              className={`flex items-center gap-3 rounded-md border-2 p-4 text-left transition-colors ${
                format === 'xml'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <FileCode className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-semibold text-slate-900">XML</p>
                <p className="text-xs text-slate-500">Standart ürün listesi</p>
              </div>
            </button>
          </div>

          {/* Dosya seçimi */}
          <div
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-slate-400"
          >
            <Upload className="h-10 w-10 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              {file ? file.name : 'Dosya seçmek için tıklayın'}
            </p>
            {file && (
              <p className="mt-1 text-xs text-slate-500">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={format === 'excel' ? '.xlsx,.xls' : '.xml,text/xml,application/xml'}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0] ?? undefined)}
              className="hidden"
            />
          </div>

          {importMutation.isError && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{(importMutation.error as Error).message}</span>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-3">
            {file && (
              <button type="button" onClick={handleReset} className="btn-secondary">
                Sıfırla
              </button>
            )}
            <button
              type="button"
              onClick={handleImport}
              disabled={!file || importMutation.isPending}
              className="btn-primary"
            >
              <Upload className="h-4 w-4" />
              {importMutation.isPending ? 'İçe aktarılıyor...' : 'İçe Aktar'}
            </button>
          </div>

          {/* Şablon bilgisi */}
          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Beklenen sütunlar / alanlar:</p>
            <p className="mt-1 font-mono">
              SKU, Name, Description, Price, Currency, Category, Brand, Unit, Notes, Attributes
            </p>
            <p className="mt-2">
              <strong>Attributes</strong> sütunu JSON string olabilir:{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-[11px]">
                {`{"color":"red","size":"XL"}`}
              </code>
            </p>
            <p className="mt-1">
              <strong>Category</strong> adı yeni ise otomatik oluşturulur.
            </p>
          </div>
        </div>
      ) : (
        <div className="card max-w-2xl">
          <div className="text-center">
            {result.added > 0 ? (
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            ) : (
              <XCircle className="mx-auto h-12 w-12 text-rose-500" />
            )}
            <h2 className="mt-3 text-xl font-bold text-slate-900">İçe Aktarma Tamamlandı</h2>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-md bg-slate-50 p-3 text-center">
              <p className="text-2xl font-bold text-slate-900">{result.total}</p>
              <p className="text-xs text-slate-500">Toplam satır</p>
            </div>
            <div className="rounded-md bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{result.added}</p>
              <p className="text-xs text-emerald-600">Eklendi</p>
            </div>
            <div className="rounded-md bg-amber-50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
              <p className="text-xs text-amber-600">Atlandı</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700">
                Hatalar ({result.errors.length})
              </h3>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Satır</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Hata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {result.errors.map((e, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono">{e.row}</td>
                        <td className="px-3 py-2 font-mono">{e.sku ?? '—'}</td>
                        <td className="px-3 py-2 text-rose-600">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={handleReset} className="btn-secondary">
              Yeni Dosya Yükle
            </button>
            <a href="/admin/products" className="btn-primary">
              <Download className="h-4 w-4" />
              Ürünlere Git
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductImport;
