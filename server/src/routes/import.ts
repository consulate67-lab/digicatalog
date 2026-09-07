import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import * as importService from '../services/import.service';
import { HttpError } from '../middleware/errorHandler';

const router = Router();

/**
 * Multer memory storage: dosya disk'e yazılmaz, buffer memory'de
 * işlenir. 10MB limit (Excel/XML için yeterli, image upload'lar
 * /products/:id/images endpoint'inde).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(authMiddleware);

/**
 * POST /api/products/import/excel
 *
 * multipart/form-data, field: "file" (.xlsx veya .xls)
 * Response: { data: { total, added, skipped, errors[] } }
 */
router.post('/excel', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    if (!req.file) throw new HttpError(400, 'Dosya gerekli (multipart field: file)');

    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream', // bazen tarayıcılar octet-stream gönderir
    ];
    if (!allowedMimes.includes(req.file.mimetype)) {
      throw new HttpError(400, `Geçersiz dosya tipi: ${req.file.mimetype}. .xlsx veya .xls gerekli`);
    }

    const result = await importService.importFromExcel(req.user.tenantId, req.file.buffer);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/products/import/xml
 *
 * multipart/form-data, field: "file" (text/xml veya application/xml)
 * VEYA Content-Type: application/xml body'de direkt XML gönderebilir
 *
 * XML yapısı:
 * <products>
 *   <product>
 *     <sku>ABC001</sku> <name>Ürün Adı</name>
 *     <price>99.90</price> <currency>TRY</currency>
 *     <category>Elektronik</category> <brand>Samsung</brand>
 *     ...
 *   </product>
 * </products>
 */
router.post('/xml', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');

    let buffer: Buffer;
    if (req.file) {
      // multipart upload
      buffer = req.file.buffer;
    } else if (req.body && (typeof req.body === 'string' || Buffer.isBuffer(req.body))) {
      // raw body
      buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body, 'utf-8');
    } else {
      throw new HttpError(400, 'XML dosyası gerekli (multipart field: file veya raw body)');
    }

    const result = await importService.importFromXml(req.user.tenantId, buffer);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/customers/import/excel
 *
 * multipart/form-data, field: "file" (.xlsx veya .xls)
 * Beklenen sütunlar: Name | ContactName | Email | Phone | Address |
 *                   TaxNumber | TaxOffice | Notes
 * Response: { data: { total, added, skipped, errors[] } }
 */
router.post('/customers/excel', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    if (!req.file) throw new HttpError(400, 'Dosya gerekli (multipart field: file)');

    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    if (!allowedMimes.includes(req.file.mimetype)) {
      throw new HttpError(400, `Geçersiz dosya tipi: ${req.file.mimetype}`);
    }

    const result = await importService.importCustomersFromExcel(req.user.tenantId, req.file.buffer);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
