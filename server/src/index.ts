/**
 * Entry point. Server'ı başlatır.
 *
 * Mimari:
 *   app.ts        → Express factory (middleware + route registry + errorHandler)
 *   server.ts     → Bootstrap (listen, graceful shutdown, DB pool yönetimi)
 *   config/       → env (zod) + database (pg + drizzle)
 *   routes/       → Domain route'lar (health, auth, products, ...)
 *   middleware/   → Global middleware (logger, errorHandler, auth, tenant)
 *   services/     → İş mantığı katmanı (Faz 1'den itibaren)
 *   db/schema/    → Drizzle şemaları (Faz 1'den itibaren)
 *   utils/        → logger ve diğer yardımcılar
 */
import { startServer } from './server';

startServer();
