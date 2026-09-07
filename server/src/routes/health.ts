import { Router } from 'express';

const router = Router();

/**
 * Health check endpoint. Railway, Render, ve Kubernetes-style deploy'lar
 * için zorunlu. 200 dönmesi = uygulama ayakta ve istek alabiliyor.
 *
 * Faz 0'da sadece uptime + env döner. Faz 1+ sonrası:
 *   - DB ping (SELECT 1)
 *   - ERP provider ping (aktifse)
 *   - Disk/RAM kullanımı
 */
router.get('/ping', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'digicatalog-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
