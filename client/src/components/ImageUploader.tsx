import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { Upload, X, Star, Loader2, ImageIcon } from 'lucide-react';
import { resizeImage, formatFileSize, type ProcessedImage } from '../lib/imageUtils';

export interface ManagedImage {
  id?: string; // server-side id (varsa)
  base64Data: string;
  mimeType: string;
  fileSize: number;
  isPrimary: boolean;
  sortOrder: number;
  /** Local-only: henüz server'a yüklenmedi (create form'da) */
  local?: boolean;
}

interface ImageUploaderProps {
  images: ManagedImage[];
  onChange: (images: ManagedImage[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

/**
 * Çoklu resim yükleme bileşeni.
 *
 * Davranış:
 * - Drag-drop veya file picker
 * - Her dosya client-side resize edilir (1500px, JPEG q=0.85)
 * - Önizleme thumbnail'ları gösterilir
 * - Yıldız ikonu: primary toggle
 * - X ikonu: kaldır
 * - İlk resim otomatik primary olur (henüz primary yoksa)
 */
const ImageUploader = ({ images, onChange, maxFiles = 10, disabled }: ImageUploaderProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    if (images.length + fileArray.length > maxFiles) {
      setError(`En fazla ${maxFiles} resim yükleyebilirsiniz`);
      return;
    }

    setIsProcessing(true);
    try {
      const processed: ManagedImage[] = [];
      for (const file of fileArray) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`${file.name}: sadece resim dosyaları desteklenir`);
        }
        const result: ProcessedImage = await resizeImage(file);
        processed.push({
          base64Data: result.base64Data,
          mimeType: result.mimeType,
          fileSize: result.fileSize,
          isPrimary: false,
          sortOrder: images.length + processed.length,
          local: true,
        });
      }
      // İlk primary yoksa, ilk eklenen primary olsun
      const hasPrimary = images.some((i) => i.isPrimary) || processed.some((i) => i.isPrimary);
      if (!hasPrimary && processed.length > 0) {
        processed[0].isPrimary = true;
      }
      onChange([...images, ...processed]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemove = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    // Primary kaldırıldıysa, ilk kalan primary olsun
    if (next.length > 0 && !next.some((i) => i.isPrimary)) {
      next[0].isPrimary = true;
    }
    onChange(next);
  };

  const handleSetPrimary = (index: number) => {
    const next = images.map((img, i) => ({ ...img, isPrimary: i === index }));
    onChange(next);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleFiles(e.target.files);
    e.target.value = ''; // aynı dosyayı tekrar seçebilmek için
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isProcessing) return;
    if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          isDragging
            ? 'border-brand-500 bg-brand-50'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400'
        } ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
        onClick={() => inputRef.current?.click()}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="mt-2 text-sm text-slate-600">Resimler işleniyor...</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              Resim yüklemek için tıklayın veya sürükleyin
            </p>
            <p className="mt-1 text-xs text-slate-500">
              PNG, JPG, WebP • Max 1500px • Otomatik sıkıştırılır
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onInputChange}
          className="hidden"
          disabled={disabled || isProcessing}
        />
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {images.map((img, i) => (
            <div
              key={img.id ?? `local-${i}`}
              className={`group relative aspect-square overflow-hidden rounded-md border-2 ${
                img.isPrimary ? 'border-brand-500' : 'border-slate-200'
              }`}
            >
              <img
                src={img.base64Data}
                alt={`Resim ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-1.5">
                {img.isPrimary ? (
                  <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Vitrin
                  </span>
                ) : (
                  <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    #{i + 1}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(i);
                  }}
                  className="rounded-full bg-black/40 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {!img.isPrimary && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetPrimary(i);
                  }}
                  className="absolute bottom-1 right-1 rounded bg-white/90 p-1 text-slate-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  title="Vitrin yap"
                >
                  <Star className="h-3 w-3" />
                </button>
              )}
              <div className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 text-[10px] text-white">
                {formatFileSize(img.fileSize)}
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && !isProcessing && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <ImageIcon className="h-3 w-3" />
          Henüz resim eklenmedi
        </p>
      )}
    </div>
  );
};

export default ImageUploader;
