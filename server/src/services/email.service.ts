import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Email service (Faz 10.1 — share creation email MVP).
 *
 * SMTP wrapper. Davranis:
 *   - SMTP_HOST bos ise: dev fallback, console.log + return { delivered:false, mode:'log' }
 *   - SMTP_HOST dolu ise: gercek SMTP ile gonderim, hata olursa firlat
 *
 * SMTP config zod-validated env uzerinden env.SMTP_*. Gelistirici
 * ortaminda bos birakilabilir (dev fallback log-only).
 *
 * Kullanim:
 *   await sendShareLink({
 *     to: 'musteri@firma.com',
 *     catalogName: 'Yaz Koleksiyonu 2026',
 *     shareUrl: 'https://.../viewer/share/abc123',
 *     expiresAt: new Date('2026-12-31'),
 *   });
 *
 * Best-effort semantik: caller (catalogShares.createShare) email
 * hatasini yakalar ve log'lar, share basarisiz olmaz.
 */

let transporter: Transporter | null = null;
let smtpInitialized = false;

/**
 * SMTP transporter'i lazy init. Ilk gercek gonderimde kurulur.
 * SMTP_HOST yoksa transporter null kalir (dev fallback).
 */
const getTransporter = (): Transporter | null => {
  if (smtpInitialized) return transporter;
  smtpInitialized = true;

  if (!env.SMTP_HOST) {
    logger.info(
      'SMTP_HOST bos, email service dev modunda (log-only fallback)',
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });

  logger.info(
    { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER || '(no auth)' },
    'SMTP transporter baslatildi',
  );
  return transporter;
};

export interface SendShareLinkInput {
  to: string;
  catalogName: string;
  shareUrl: string;
  expiresAt: Date;
}

export interface SendResult {
  delivered: boolean;
  mode: 'smtp' | 'log';
  messageId?: string;
}

/**
 * Share link email'i gonder. Dev modunda (SMTP_HOST yok) sadece
 * console.log'a yazar, return delivered:false.
 *
 * Production'da SMTP_HOST zorunlu (deploy rehberinde belirtildi).
 */
export const sendShareLink = async (
  input: SendShareLinkInput,
): Promise<SendResult> => {
  const subject = `${input.catalogName} dijital katalogu sizinle paylasildi`;

  // === Email body (HTML + plain text) ===
  const expiresFormatted = input.expiresAt.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const textBody = [
    `Sayin Musterimiz,`,
    ``,
    `${input.catalogName} katalogunu incelemeniz icin sizinle paylasiyoruz.`,
    `Kataloga erismek icin asagidaki baglantiya tiklayabilirsiniz:`,
    ``,
    input.shareUrl,
    ``,
    `Bu baglanti ${expiresFormatted} tarihine kadar gecerlidir.`,
    ``,
    `Saygilarimizla,`,
    `DijiCatalog Ekibi`,
  ].join('\n');

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #0F172A; font-size: 20px; margin: 0 0 16px 0;">
    ${escapeHtml(input.catalogName)}
  </h2>
  <p style="color: #334155; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
    Sayin Musterimiz, <strong>${escapeHtml(input.catalogName)}</strong> katalogunu
    incelemeniz icin sizinle paylasiyoruz.
  </p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(input.shareUrl)}"
       style="display: inline-block; background: #6366F1; color: #FFFFFF;
              text-decoration: none; padding: 12px 24px; border-radius: 6px;
              font-weight: 600; font-size: 15px;">
      Katalogu Ac
    </a>
  </p>
  <p style="color: #64748B; font-size: 13px; margin: 24px 0 8px 0;">
    Veya bu baglantiyi tarayicinizda acabilirsiniz:
  </p>
  <p style="background: #F1F5F9; border-radius: 4px; padding: 12px;
            font-family: monospace; font-size: 12px; color: #475569;
            word-break: break-all; margin: 0;">
    ${escapeHtml(input.shareUrl)}
  </p>
  <p style="color: #94A3B8; font-size: 13px; margin: 24px 0 0 0;">
    Bu baglanti <strong>${escapeHtml(expiresFormatted)}</strong> tarihine kadar gecerlidir.
  </p>
  <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />
  <p style="color: #94A3B8; font-size: 12px; margin: 0;">
    DijiCatalog Ekibi
  </p>
</div>
`.trim();

  const t = getTransporter();
  if (!t) {
    // Dev fallback — log only
    logger.info(
      {
        mode: 'log',
        to: input.to,
        subject,
        shareUrl: input.shareUrl,
        expiresAt: input.expiresAt.toISOString(),
        preview: textBody.split('\n').slice(0, 5).join(' | '),
      },
      '[email:dev] Share link email (SMTP yok, log-only)',
    );
    return { delivered: false, mode: 'log' };
  }

  const info = await t.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject,
    text: textBody,
    html: htmlBody,
  });

  logger.info(
    { messageId: info.messageId, to: input.to, subject },
    '[email:smtp] Share link gonderildi',
  );
  return { delivered: true, mode: 'smtp', messageId: info.messageId };
};

/**
 * HTML escape helper (email template icin).
 * Disaridan gelen catalogName/shareUrl'i sanitize etmek icin.
 * Validation zaten yapilmis olsa da defense-in-depth.
 */
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// === Test helper (smoke test'ler icin) ===

/**
 * Test amaçlı: mevcut transporter'ı resetle. Smoke testlerde
 * her test isolated SMTP config ile başlasın.
 */
export const _resetTransporterForTest = (): void => {
  transporter = null;
  smtpInitialized = false;
};