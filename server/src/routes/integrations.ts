import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import * as erpSyncService from '../services/erpSync.service';
import { listProviders } from '../integrations/erp';
import { HttpError } from '../middleware/errorHandler';

const router = Router();

// Tüm integration endpoint'leri auth gerektirir
router.use(authMiddleware);

/**
 * GET /api/integrations/erp/providers
 * Desteklenen provider listesi (UI dropdown için)
 * Response: [{ name, label, description, configSchema: [...] }]
 */
router.get('/erp/providers', (_req, res) => {
  res.json({ data: listProviders() });
});

/**
 * GET /api/integrations/erp
 * Mevcut tenant ERP config (şifre redakte edilmiş)
 * Response: { provider, config, providerMeta }
 */
router.get('/erp', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const result = await erpSyncService.getTenantErpConfigResponse(req.user.tenantId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/integrations/erp
 * Body: { provider: 'mock' | 'korgun-mssql', config: {...} }
 * Admin only — hassas bilgi (DB şifresi)
 */
const configSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));

const setConfigSchema = z.object({
  provider: z.string().min(1),
  config: configSchema,
});

router.put('/erp', requireRole('admin'), async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const body = setConfigSchema.parse(req.body);
    await erpSyncService.setTenantErpConfig(req.user.tenantId, body.provider, body.config);
    const result = await erpSyncService.getTenantErpConfigResponse(req.user.tenantId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/integrations/erp/test
 * Provider'a ping at, sonucu dön
 * Response: { ok, latencyMs, message?, details? }
 */
router.post('/erp/test', requireRole('admin'), async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const result = await erpSyncService.testConnection(req.user.tenantId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/integrations/erp/sync/products
 * Ürünleri ERP'den çekip DijiCatalog DB'ye upsert et
 * Response: { data: SyncResult }
 */
router.post('/erp/sync/products', requireRole('admin', 'member'), async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const result = await erpSyncService.syncProducts(req.user.tenantId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/integrations/erp/sync/customers
 * Müşterileri ERP'den çekip DijiCatalog DB'ye upsert et
 */
router.post('/erp/sync/customers', requireRole('admin', 'member'), async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const result = await erpSyncService.syncCustomers(req.user.tenantId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
