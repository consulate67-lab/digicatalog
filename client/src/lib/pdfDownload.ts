import api from './api';

export interface PdfDownloadOptions {
  catalogId: string;
  productIds?: string[];
  /** Full vs selected filename prefix */
  filenamePrefix?: string;
}

/**
 * PDF download helper. POST endpointinden gelen binary response'i
 * browser'da otomatik indirir.
 *
 * Kullanim:
 *   const download = usePdfDownload();
 *   await download({ catalogId: 'xxx' });
 *
 * Akis:
 * 1) POST endpointine istek (responseType: 'blob')
 * 2) Blob'dan object URL olustur
 * 3) Gizli <a> elementine download attribute ile tikla
 * 4) Cleanup: URL.revokeObjectURL
 */
export const downloadCatalogPdf = async (options: PdfDownloadOptions): Promise<void> => {
  const { catalogId, productIds, filenamePrefix = 'katalog' } = options;

  // Endpoint secimi
  const endpoint = productIds
    ? `/catalogs/${catalogId}/pdf/selected`
    : `/catalogs/${catalogId}/pdf/full`;

  // Body
  const body = productIds ? { productIds } : {};

  const response = await api.post(endpoint, body, {
    responseType: 'blob',
    timeout: 60_000, // 60s (buyuk kataloglar icin)
  });

  // Blob'dan filename: Content-Disposition header'ini parse et, yoksa default
  const disposition = response.headers['content-disposition'] ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] ?? `${filenamePrefix}-${Date.now()}.pdf`;

  // Browser'da indir
  const blob = response.data as Blob;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Cleanup (browser'da bazen gerekli)
  setTimeout(() => window.URL.revokeObjectURL(url), 100);
};
