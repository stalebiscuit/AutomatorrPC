import { loadConfig } from '../../config.js';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** The one-time-code email. Plain, high-deliverability, code front-and-centre. */
export function renderOtpEmail(code: string, ttlMinutes: number): RenderedEmail {
  const product = loadConfig().OTP_FROM_NAME;
  const subject = `${code} is your ${product} admin sign-in code`;
  const text = [
    `Your ${product} admin sign-in code is:`,
    ``,
    `    ${code}`,
    ``,
    `It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.`,
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0b1020">
  <p style="margin:0 0 8px;font-size:14px;color:#5a6472">Your ${product} admin sign-in code is</p>
  <p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:6px">${code}</p>
  <p style="margin:0;font-size:13px;color:#5a6472">It expires in ${ttlMinutes} minutes. If you didn't request this, you can safely ignore this email.</p>
</div>`;
  return { subject, text, html };
}
