import { loadConfig } from '../../config.js';
import { logger } from '../../lib/logger.js';
import type { Transporter } from 'nodemailer';

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(input: SendMailInput): Promise<void>;
}

/** Dev/test provider — logs the message (incl. the OTP code) to the server console. */
class ConsoleMailer implements Mailer {
  async send(input: SendMailInput): Promise<void> {
    logger.info(
      `[mailer:console] → ${input.to}\n  Subject: ${input.subject}\n  ${input.text.replace(/\n/g, '\n  ')}`,
    );
  }
}

/** Production provider — SMTP via nodemailer (lazy-loaded so console mode has no dep cost). */
class SmtpMailer implements Mailer {
  private transportP: Promise<Transporter> | null = null;

  private transport(): Promise<Transporter> {
    if (!this.transportP) {
      this.transportP = (async () => {
        const cfg = loadConfig();
        const nodemailer = (await import('nodemailer')).default;
        return nodemailer.createTransport({
          host: cfg.SMTP_HOST,
          port: cfg.SMTP_PORT,
          secure: cfg.SMTP_SECURE,
          auth: cfg.SMTP_USER ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined,
        });
      })();
    }
    return this.transportP;
  }

  async send(input: SendMailInput): Promise<void> {
    const cfg = loadConfig();
    const transport = await this.transport();
    await transport.sendMail({
      from: `"${cfg.OTP_FROM_NAME}" <${cfg.OTP_FROM}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }
}

let cached: Mailer | null = null;

/** The active mailer, chosen by MAILER_PROVIDER. Memoised. */
export function getMailer(): Mailer {
  if (cached) return cached;
  cached = loadConfig().MAILER_PROVIDER === 'smtp' ? new SmtpMailer() : new ConsoleMailer();
  return cached;
}

/** Test seam — force a specific mailer (or clear the cache). */
export function setMailerForTests(mailer: Mailer | null): void {
  cached = mailer;
}
