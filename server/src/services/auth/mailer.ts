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

/**
 * Production provider — Microsoft Graph sendMail via app-only (client-
 * credentials) auth. Needs an app registration with the application permission
 * Mail.Send (admin-consented). OTP_FROM is the sender mailbox. Token is cached
 * until shortly before expiry.
 */
class GraphMailer implements Mailer {
  private token: string | null = null;
  private expiresAt = 0;

  private async getToken(): Promise<string> {
    const cfg = loadConfig();
    const now = Date.now();
    if (this.token && now < this.expiresAt - 60_000) return this.token;
    const res = await fetch(
      `https://login.microsoftonline.com/${cfg.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.GRAPH_CLIENT_ID ?? '',
          client_secret: cfg.GRAPH_CLIENT_SECRET ?? '',
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      },
    );
    if (!res.ok) throw new Error(`Graph token request failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = json.access_token;
    this.expiresAt = now + json.expires_in * 1000;
    return this.token;
  }

  async send(input: SendMailInput): Promise<void> {
    const cfg = loadConfig();
    const token = await this.getToken();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.OTP_FROM)}/sendMail`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: input.html ? 'HTML' : 'Text', content: input.html ?? input.text },
            from: { emailAddress: { address: cfg.OTP_FROM } },
            toRecipients: [{ emailAddress: { address: input.to } }],
          },
          saveToSentItems: false,
        }),
      },
    );
    if (!res.ok) throw new Error(`Graph sendMail failed (${res.status}): ${await res.text()}`);
  }
}

let cached: Mailer | null = null;

/** The active mailer, chosen by MAILER_PROVIDER. Memoised. */
export function getMailer(): Mailer {
  if (cached) return cached;
  const provider = loadConfig().MAILER_PROVIDER;
  cached =
    provider === 'smtp'
      ? new SmtpMailer()
      : provider === 'graph'
        ? new GraphMailer()
        : new ConsoleMailer();
  return cached;
}

/** Test seam — force a specific mailer (or clear the cache). */
export function setMailerForTests(mailer: Mailer | null): void {
  cached = mailer;
}
