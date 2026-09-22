import { logger } from '../utils/logger';

/**
 * ERP ürün resimlerini IIS'ten indirip base64'e çeviren helper.
 *
 * Korgun ERP 'Picture' kolonu tam UNC veya Windows path doner:
 *   "\\\\abkadc\\DATA\\RESIM\\62\\62 753 327 0933..jpg"
 *
 * IIS 'resim' sitesi port 1983'te, document root \\abkadc\DATA\RESIM\.
 * Sync asagidaki gibi URL olusturur:
 *   http://192.168.2.67:1983/62/62 753 327 0933..jpg
 *
 * Strateji: ERP_IMAGE_PATH_PREFIX env variable ile DB path'inin bas kismi
 * (UNC dahil) kesilir, kalan relative path IIS URL'ine eklenir. Boylece
 *   path markeri ('/IMAGE/' gibi) degil, gercek UNC prefix'i kullanilir —
 *   farkli ERP kurulumlarinda /RESIM/, /IMAGE/, /images/, /pictures/ gibi
 *   klasor adlari tutarli calisir.
 *
 * Hata durumunda null doner (timeout, 404, >10MB, bos path). ERP sync skip.
 */

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
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
 * DB path'inin basindaki prefix'i keser. Oncelik:
 *   1. ERP_IMAGE_PATH_PREFIX env variable (tam match, case-insensitive)
 *   2. Marker fallback (IMAGE/, RESIM/, RESİM/, images/, pictures/, img/)
 *   3. Tum path (prefix taninmadi — IIS'de bulamayabilir, failed olur)
 *
 * Returns relative path (IIS document root'tan itibaren) veya null.
 */
export const pathToIisRelative = (
  picturePath: string,
  stripPrefix?: string,
): string | null => {
  if (!picturePath || typeof picturePath !== 'string') return null;
  // Normalize: back-slash -> forward-slash, trim
  let normalized = picturePath.replace(/\\/g, '/').trim();
  if (!normalized) return null;

  // 1) Env variable prefix (case-insensitive)
  if (stripPrefix) {
    const normPrefix = stripPrefix.replace(/\\/g, '/').trim();
    if (normPrefix) {
      const lowerPath = normalized.toLowerCase();
      const lowerPrefix = normPrefix.toLowerCase();
      // Prefix'in basindaki slash'i de karsilastir (\\abkadc\data\resim vs \\abkadc\data\resim\)
      const prefixVariants = [
        normPrefix,
        normPrefix.replace(/\/$/, ''),
        lowerPrefix,
        lowerPrefix.replace(/\/$/, ''),
      ];
      for (const p of prefixVariants) {
        const idx = lowerPath.indexOf(p.toLowerCase());
        if (idx >= 0) {
          normalized = normalized.slice(idx + p.length);
          // Leading slash temizle
          while (normalized.startsWith('/')) normalized = normalized.slice(1);
          return normalized;
        }
      }
    }
  }

  // 2) Marker fallback (bilinen klasor adlari)
  const markers = ['/IMAGE/', '/RESIM/', '/RESİM/', '/IMAGES/', '/PICTURES/', '/IMG/'];
  for (const marker of markers) {
    const idx = normalized.toUpperCase().indexOf(marker.toUpperCase());
    if (idx >= 0) {
      return normalized.slice(idx + marker.length);
    }
  }

  // 3) Taninmadi — null donmek yerine full path dene (belki IIS'te tam path
  // serve ediliyordur). Son care.
  return normalized;
};

export const fetchProductImage = async (
  picturePath: string,
  urlPrefix: string,
  stripPrefix?: string,
): Promise<FetchedImage | null> => {
  if (!picturePath || typeof picturePath !== 'string') return null;

  const relPath = pathToIisRelative(picturePath, stripPrefix);
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