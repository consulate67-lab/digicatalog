import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';
import { HttpError } from '../middleware/errorHandler';

const router = Router();

/**
 * Auth endpoint'leri. Public (register, login, refresh) + Protected (me).
 *
 * POST /api/auth/register → tenant + admin user oluşturur
 * POST /api/auth/login    → email/password ile token al
 * POST /api/auth/refresh  → refresh token ile yeni access al
 * GET  /api/auth/me       → mevcut kullanıcı + tenant bilgisi
 */

// === Validation schemas ===

const registerSchema = z.object({
  tenantName: z.string().min(2, 'Firma adı en az 2 karakter').max(100),
  tenantSlug: z
    .string()
    .min(2, 'Slug en az 2 karakter')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Sadece küçük harf, rakam ve tire kullanılabilir'),
  email: z.string().email('Geçerli bir email girin'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı'),
  name: z.string().min(2, 'Ad en az 2 karakter').max(100),
});

const loginSchema = z.object({
  email: z.string().email('Geçerli bir email girin'),
  password: z.string().min(1, 'Şifre gerekli'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token gerekli'),
});

// === Routes ===

/**
 * POST /api/auth/register
 *
 * Yeni tenant + ilk admin user oluşturur. Body:
 *   { tenantName, tenantSlug, email, password, name }
 *
 * Response 201:
 *   { user: {...}, tokens: { accessToken, refreshToken } }
 */
router.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 *
 * Body: { email, password }
 * Response 200: { user, tokens }
 */
router.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 *
 * Body: { refreshToken }
 * Response 200: { tokens: { accessToken, refreshToken } }
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const input = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(input.refreshToken);
    res.json({ tokens });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 *
 * Protected. Authorization: Bearer <accessToken>
 * Response 200: { user, tenant }
 */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'Kimlik doğrulama gerekli');
    const result = await authService.getMe(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
