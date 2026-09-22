import { logger } from '../utils/logger';

/**
 * ERP ürün resimlerini IIS'ten indirip base64'e çeviren helper.
 *
 * Korgun ERP 'Picture' kolonu tam Windows path doner:
 *   "C:\\Korgun\\kgkg_exe\\IMAGE\\products\\uren123.jpg"
 * IIS ise IMAGE/ root'una göre serve eder:
 *   "http://192.168.1.100:1903/products/uren123.jpg"
 *
 * Bu modul path'ten IIS-relative kismi cikarir, fetch eder, base64 doner.
 * Hata durumunda null doner (timeout, 404, >10MB, bos path). ERP sync
 * skip eder, hata firlatmaz.
 */

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB (kullanici gereksinimi)
const FETCH_TIMEOUT_MS = 5000;

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

export interface FetchedImage {
  base64Data: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Picture path'inden IIS URL'i olusturur. IMAGE/ sonrasi kismi alir.
 */
const pathToIisRelative = (picturePath: string): string => {
  const normalized = picturePath.replace(/\\/g, '/');
  const marker = '/IMAGE/';
  const idx = normalized.lastIndexOf(marker);
  return idx >= 0 ? normalized.slice(idx + marker.length) : normalized;
};

export const fetchProductImage = async (
  picturePath: string,
  urlPrefix: string,
): Promise<FetchedImage | null> => {
  if (!picturePath || typeof picturePath !== 'string') return null;

  const relPath = pathToIisRelative(picturePath).trim();
  if (!relPath) return null;

  const prefix = urlPrefix.endsWith('/') ? urlPrefix : `${urlPrefix}/`;
  const url = `${prefix}${relPath}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'Image fetch: HTTP non-OK');
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    if (buf.length > MAX_IMAGE_SIZE) {
      logger.warn({ url, size: buf.length, limit: MAX_IMAGE_SIZE }, 'Image fetch: >10MB skip');
      return null;
    }
    const ext = relPath.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = MIME_MAP[ext] ?? 'image/jpeg';
    return {
      base64Data: buf.toString('base64'),
      mimeType,
      fileSize: buf.length,
    };
  } catch (err) {
    logger.warn({ url, err: (err as Error).message }, 'Image fetch failed');
    return null;
  } finally {
    clearTimeout(timer);
  }
};