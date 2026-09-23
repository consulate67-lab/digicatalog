import { Router } from 'express';
import sql from 'mssql';
import { getPool } from '../config/database';

/**
 * Public PDF Templates endpoint (Faz 9.9 polish).
 *
 * Mount: app.use('/api/public/templates', publicTemplatesRouter)
 * NO auth — public endpoint, viewer.tsx ve public-share.ts tarafindan
 * kullanilir.
 *
 * Sadece SISTEM (is_system=1) preset sablonlari doner. Tenant-ozel
 * sablonlar auth gerektiren admin endpoint uzerinden sunulur
 * (/api/admin/pdf-templates).
 */

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT id, name, slug, category, description, layout_json
      FROM pdf_templates
      WHERE is_system = 1 AND tenant_id IS NULL
      ORDER BY category ASC, name ASC
    `);

    const items = r.recordset.map((row) => {
      let layout: Record<string, unknown> = {};
      try {
        layout = row.layout_json ? JSON.parse(row.layout_json as string) : {};
      } catch {
        layout = {};
      }
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        category: row.category,
        description: row.description,
        layout,
      };
    });

    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

export default router;
