import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../config/database';
import { users, tenants } from '../db/schema';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Auth service. İş mantığı katmanı — route handler'lar sadece
 * validation + bu servisi çağırır, SQL burada kalır.
 *
 * JWT stratejisi:
 * - Access token: 15dk (default), kısa ömürlü, her API call'da gönderilir
 * - Refresh token: 7 gün (default), uzun ömürlü, sadece /auth/refresh'te
 * - İkisi de aynı secret ile imzalanır (production'da ayrı secret önerilir)
 *
 * Tenant izolasyonu:
 * - Register: yeni tenant + admin user aynı transaction'da oluşturulur
 * - Login: user bulunur, payload'da tenantId set edilir
 * - Tüm sonraki query'ler req.user.tenantId ile filtrelenir
 */

export interface AuthPayload {
  userId: string;
  tenantId: string;
  role: 'admin' | 'member';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BCRYPT_ROUNDS = 10;

// === Şifre ===

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// === JWT ===

export const signAccessToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const signRefreshToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const verifyToken = (token: string): AuthPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    return {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
    };
  } catch (err) {
    logger.debug({ err }, 'JWT verification failed');
    throw new HttpError(401, 'Invalid or expired token');
  }
};

// === DB helpers ===

const stripPassword = <T extends { passwordHash: string }>(user: T): PublicUser => {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest as unknown as PublicUser;
};

// === Public API ===

export interface RegisterInput {
  tenantName: string;
  tenantSlug: string;
  email: string;
  password: string;
  name: string;
}

export const register = async (
  input: RegisterInput,
): Promise<{ user: PublicUser; tokens: AuthTokens }> => {
  // 1) Slug benzersizlik kontrolü
  const existingSlug = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, input.tenantSlug))
    .limit(1);
  if (existingSlug.length > 0) {
    throw new HttpError(409, 'Bu slug zaten kullanılıyor');
  }

  // 2) Email benzersizlik kontrolü
  const existingEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existingEmail.length > 0) {
    throw new HttpError(409, 'Bu email zaten kayıtlı');
  }

  // 3) Şifre hash
  const passwordHash = await hashPassword(input.password);

  // 4) Tenant + admin user (transaction)
  const result = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: input.tenantName, slug: input.tenantSlug })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: input.email,
        passwordHash,
        name: input.name,
        role: 'admin', // İlk kullanıcı her zaman admin
      })
      .returning();

    return { tenant, user };
  });

  // 5) Token üret
  const payload: AuthPayload = {
    userId: result.user.id,
    tenantId: result.tenant.id,
    role: 'admin',
  };
  const tokens: AuthTokens = {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };

  logger.info(
    { tenantId: result.tenant.id, userId: result.user.id, slug: result.tenant.slug },
    'New tenant registered',
  );

  return { user: stripPassword(result.user), tokens };
};

export interface LoginInput {
  email: string;
  password: string;
}

export const login = async (
  input: LoginInput,
): Promise<{ user: PublicUser; tokens: AuthTokens }> => {
  // 1) User bul
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!user) {
    // Kullanıcı var/yok bilgisi sızdırmamak için generic mesaj
    throw new HttpError(401, 'Email veya şifre hatalı');
  }

  // 2) Aktiflik kontrolü
  if (!user.isActive) {
    throw new HttpError(403, 'Hesap devre dışı bırakılmış');
  }

  // 3) Şifre doğrula
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, 'Email veya şifre hatalı');
  }

  // 4) Son giriş zamanı güncelle (fire-and-forget, ana akışı bloklamaz)
  void db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id))
    .catch((err) => logger.warn({ err, userId: user.id }, 'lastLoginAt update failed'));

  // 5) Token üret
  const payload: AuthPayload = {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  };
  const tokens: AuthTokens = {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };

  logger.info({ userId: user.id, tenantId: user.tenantId }, 'User logged in');

  return { user: stripPassword(user), tokens };
};

export const refresh = async (refreshToken: string): Promise<AuthTokens> => {
  // 1) Refresh token doğrula
  const payload = verifyToken(refreshToken);

  // 2) User hâlâ var mı ve aktif mi?
  const [user] = await db
    .select({ id: users.id, tenantId: users.tenantId, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new HttpError(401, 'Kullanıcı bulunamadı veya devre dışı');
  }

  // 3) Yeni token çifti üret
  const newPayload: AuthPayload = {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  };
  return {
    accessToken: signAccessToken(newPayload),
    refreshToken: signRefreshToken(newPayload),
  };
};

export const getMe = async (userId: string): Promise<{ user: PublicUser; tenant: { id: string; name: string; slug: string } }> => {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new HttpError(404, 'Kullanıcı bulunamadı');

  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);
  if (!tenant) throw new HttpError(404, 'Tenant bulunamadı');

  return { user: stripPassword(user), tenant };
};
