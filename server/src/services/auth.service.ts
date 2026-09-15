import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sql from 'mssql';
import { getPool } from '../config/database';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/**
 * Auth service. Is mantigi katmani — route handler'lar sadece
 * validation + bu servisi cagirir.
 *
 * NOT: Drizzle ORM'den raw mssql'e gecildi. TDB (transaction) tek bir
 * sql.Request + manual BEGIN/COMMIT ile yapiliyor (veya pool.transaction()).
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

// === Sifre ===

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
  const pool = await getPool();

  // 1) Slug benzersizlik kontrolu
  const slugCheck = await pool.request()
    .input('slug', sql.NVarChar, input.tenantSlug)
    .query(`SELECT id FROM tenants WHERE slug = @slug`);
  if (slugCheck.recordset[0]) {
    throw new HttpError(409, 'Bu slug zaten kullaniliyor');
  }

  // 2) Email benzersizlik kontrolu
  const emailCheck = await pool.request()
    .input('email', sql.NVarChar, input.email)
    .query(`SELECT id FROM users WHERE email = @email`);
  if (emailCheck.recordset[0]) {
    throw new HttpError(409, 'Bu email zaten kayitli');
  }

  // 3) Sifre hash
  const passwordHash = await hashPassword(input.password);

  // 4) Tenant + admin user (transaction)
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const tenantResult = await tx.request()
      .input('name', sql.NVarChar, input.tenantName)
      .input('slug', sql.NVarChar, input.tenantSlug)
      .query(`INSERT INTO tenants (name, slug)
              OUTPUT INSERTED.id, INSERTED.name, INSERTED.slug, INSERTED.erp_provider, INSERTED.erp_config,
                     INSERTED.created_at AS createdAt, INSERTED.updated_at AS updatedAt
              VALUES (@name, @slug)`);
    const tenant = tenantResult.recordset[0];

    const userResult = await tx.request()
      .input('tenantId', sql.UniqueIdentifier, tenant.id)
      .input('email', sql.NVarChar, input.email)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('name', sql.NVarChar, input.name)
      .input('role', sql.NVarChar, 'admin')
      .query(`INSERT INTO users (tenant_id, email, password_hash, name, role)
              OUTPUT INSERTED.id, INSERTED.tenant_id AS tenantId, INSERTED.email, INSERTED.name,
                     INSERTED.role, INSERTED.is_active AS isActive, INSERTED.last_login_at AS lastLoginAt,
                     INSERTED.created_at AS createdAt, INSERTED.updated_at AS updatedAt
              VALUES (@tenantId, @email, @passwordHash, @name, @role)`);
    const user = userResult.recordset[0];
    await tx.commit();

    // 5) Token uret
    const payload: AuthPayload = {
      userId: user.id,
      tenantId: tenant.id,
      role: 'admin',
    };
    const tokens: AuthTokens = {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    };

    logger.info({ tenantId: tenant.id, userId: user.id, slug: tenant.slug }, 'New tenant registered');
    return { user, tokens };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
};

export interface LoginInput {
  email: string;
  password: string;
}

export const login = async (
  input: LoginInput,
): Promise<{ user: PublicUser; tokens: AuthTokens }> => {
  const pool = await getPool();

  // 1) User bul
  const r = await pool.request()
    .input('email', sql.NVarChar, input.email)
    .query(`SELECT id, tenant_id AS tenantId, email, password_hash AS passwordHash, name,
            role, is_active AS isActive, last_login_at AS lastLoginAt,
            created_at AS createdAt, updated_at AS updatedAt
     FROM users WHERE email = @email`);
  const user = r.recordset[0];

  if (!user) {
    // Kullanici var/yok bilgisi sizdirmamak icin generic mesaj
    throw new HttpError(401, 'Email veya sifre hatali');
  }

  // 2) Aktiflik kontrolu
  if (!user.isActive) {
    throw new HttpError(403, 'Hesap devre disi birakilmis');
  }

  // 3) Sifre dogrula
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, 'Email veya sifre hatali');
  }

  // 4) Son giris zamani guncelle (fire-and-forget)
  void pool.request()
    .input('id', sql.UniqueIdentifier, user.id)
    .query(`UPDATE users SET last_login_at = getdate() WHERE id = @id`)
    .catch((err: unknown) => logger.warn({ err, userId: user.id }, 'lastLoginAt update failed'));

  // 5) Token uret
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
  return { user, tokens };
};

export const refresh = async (refreshToken: string): Promise<AuthTokens> => {
  // 1) Refresh token dogrula
  const payload = verifyToken(refreshToken);

  // 2) User hala var mi ve aktif mi?
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.UniqueIdentifier, payload.userId)
    .query(`SELECT id, tenant_id AS tenantId, role, is_active AS isActive FROM users WHERE id = @id`);
  const user = r.recordset[0];

  if (!user || !user.isActive) {
    throw new HttpError(401, 'Kullanici bulunamadi veya devre disi');
  }

  // 3) Yeni token cifti uret
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
  const pool = await getPool();
  const userR = await pool.request()
    .input('id', sql.UniqueIdentifier, userId)
    .query(`SELECT id, tenant_id AS tenantId, email, name, role,
            is_active AS isActive, last_login_at AS lastLoginAt,
            created_at AS createdAt, updated_at AS updatedAt
     FROM users WHERE id = @id`);
  const user = userR.recordset[0];
  if (!user) throw new HttpError(404, 'Kullanici bulunamadi');

  const tenantR = await pool.request()
    .input('id', sql.UniqueIdentifier, user.tenantId)
    .query(`SELECT id, name, slug FROM tenants WHERE id = @id`);
  const tenant = tenantR.recordset[0];
  if (!tenant) throw new HttpError(404, 'Tenant bulunamadi');

  return { user, tenant };
};