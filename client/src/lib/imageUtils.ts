/**
 * Client-side image processing.
 *
 * Server'da sharp yok (native dep, Railway'de sorun çıkarabilir).
 * Bu yüzden:
 * 1) Browser Canvas API ile max 1500px'e resize
 * 2) JPEG/PNG sıkıştırma (quality 0.85)
 * 3) base64 data URL encode
 * 4) Server'a gönder (10MB validation sonra DB'ye)
 *
 * Avantajlar: server native depsiz, daha hızlı, Railway uyumlu.
 * Dezavantaj: bulk import'ta resim eklenemez (sadece metadata).
 */

export interface ProcessedImage {
  base64Data: string; // "data:image/jpeg;base64,..."
  mimeType: string;
  fileSize: number; // bytes (compressed)
  originalSize: number;
  originalName: string;
}

export interface ResizeOptions {
  maxSize?: number; // max width/height, default 1500
  quality?: number; // 0-1, default 0.85
}

export const resizeImage = (
  file: File,
  options: ResizeOptions = {},
): Promise<ProcessedImage> => {
  const maxSize = options.maxSize ?? 1500;
  const quality = options.quality ?? 0.85;

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Sadece resim dosyaları desteklenir'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Dosya okunamadı'));

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Resim yüklenemedi'));
      img.onload = () => {
        let { width, height } = img;

        // Aspect ratio koru, max dimension 1500px
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context kullanılamıyor'));
          return;
        }

        // Beyaz arkaplan (PNG transparency JPEG'e dönüşünce siyaha döner)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // PNG dışındaki her şeyi JPEG'e çevir (boyut avantajı)
        const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputMime, quality);

        // File size tahmini (base64 → binary: 0.75 oranı)
        const base64Part = dataUrl.split(',')[1] ?? '';
        const fileSize = Math.round((base64Part.length * 3) / 4);

        resolve({
          base64Data: dataUrl,
          mimeType: outputMime,
          fileSize,
          originalSize: file.size,
          originalName: file.name,
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
