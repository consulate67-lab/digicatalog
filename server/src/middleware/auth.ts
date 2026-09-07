import { Request, Response, NextFunction } from 'express';
import { verifyToken, type AuthPayload } from '../services/auth.service';
import { HttpError } from './errorHandler';

/**
 * JWT doğrulama middleware. Her korumalı route'tan ÖNCE eklenir.
 *
 *   router.get('/me', authMiddleware, handler)
 *
 * Token yoksa → 401, geçersizse → 401, süresi dolmuşsa → 401.
 * Başarılı doğrulamada req.user set edilir (id, tenantId, role).
 */
export const authMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authorization header eksik veya hatalı');
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new HttpError(401, 'Token boş olamaz');
  }

  try {
    const payload: AuthPayload = verifyToken(token);
    req.user = {
      id: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    };
    next();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, 'Token doğrulanamadı');
  }
};

/**
 * Rol-bazlı yetkilendirme. authMiddleware'den SONRA eklenir.
 *
 *   router.delete('/users/:id', authMiddleware, requireRole('admin'), handler)
 *
 * Birden fazla role kabul edilebilir: requireRole('admin', 'member')
 */
export const requireRole = (...allowedRoles: Array<'admin' | 'member'>) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new HttpError(401, 'Kimlik doğrulama gerekli');
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new HttpError(403, 'Bu işlem için yetkiniz yok');
    }
    next();
  };
};
