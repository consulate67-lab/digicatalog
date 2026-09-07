/**
 * Express Request tipini genişletiyoruz. authMiddleware sonrası
 * `req.user` her route'da erişilebilir olur.
 */
import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        tenantId: string;
        role: 'admin' | 'member';
      };
    }
  }
}

export {};
