import 'dotenv/config';
import { z } from 'zod';

/**
 * Env schema — validated once at boot. Missing/invalid required vars fail fast.
 * Vars marked optional belong to deferred features (Claude verdict) per spec §13.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),

  // ── Admin auth (passwordless email-OTP + RS256 JWT) ──
  // RS256 keypair as base64-encoded PEM (or raw PEM). Required in production;
  // auto-generated ephemerally in dev/test when absent. `npm run generate-keys`.
  ADMIN_JWT_PRIVATE_KEY: z.string().optional(),
  ADMIN_JWT_PUBLIC_KEY: z.string().optional(),

  // Founders — locked super-admins (comma-separated emails).
  SUPERADMIN_EMAILS: z
    .string()
    .default('daniel.hardman@automatorr.com,abishai.bajaj@automatorr.com'),

  // OTP email delivery.
  MAILER_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  OTP_FROM: z.string().default('AI@Automatorr.com'),
  OTP_FROM_NAME: z.string().default('Speccify'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Session / OTP tunables (defaults per spec §5).
  ACCESS_TTL_MIN: z.coerce.number().int().positive().default(15),
  SESSION_MAX_HOURS: z.coerce.number().int().positive().default(8),
  OTP_TTL_MIN: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_INTERVAL_SEC: z.coerce.number().int().nonnegative().default(30),
  OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),

  /** Shared secret required (when set) on POST /events/conversion — the
   *  affiliate postback endpoint (review fix 1.2, forged-conversion guard). */
  CONVERSION_WEBHOOK_SECRET: z.string().optional(),

  PRICE_PROVIDER: z.enum(['scraper']).default('scraper'),
  VERDICT_PROVIDER: z.enum(['placeholder', 'seeded', 'claude']).default('seeded'),

  SCRAPE_CRON: z.string().default('15 3 * * *'),
  SCRAPE_USER_AGENT: z
    .string()
    .default('AutomatorrPriceBot/1.0 (+https://automatorr.com/bot)'),
  ROLLUP_CRON: z.string().default('0 * * * *'),
  CATALOG_INGEST_CRON: z.string().default('30 4 * * *'),

  // Task 3 — Icecat spec source (optional until wired; see docs/task3-credentials-checklist.md)
  ICECAT_USERNAME: z.string().optional(),
  ICECAT_API_TOKEN: z.string().optional(),
  ICECAT_APP_KEY: z.string().optional(), // Full Icecat (paid) — required for restricted brands (AMD/Intel/etc.)
  ICECAT_CONTENT_TOKEN: z.string().optional(),
  ICECAT_LANG: z.string().default('EN'),

  // Deferred (spec §14) — optional until the Claude provider is wired.
  ANTHROPIC_API_KEY: z.string().optional(),
  VERDICT_MODEL: z.string().default('claude-haiku-4-5-20251001'),
}).superRefine((cfg, ctx) => {
  if (cfg.NODE_ENV !== 'production') return;
  if (!cfg.ADMIN_JWT_PRIVATE_KEY || !cfg.ADMIN_JWT_PUBLIC_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'ADMIN_JWT_PRIVATE_KEY and ADMIN_JWT_PUBLIC_KEY are required in production (run `npm run generate-keys`).',
    });
  }
  if (cfg.MAILER_PROVIDER === 'smtp' && (!cfg.SMTP_HOST || !cfg.SMTP_USER || !cfg.SMTP_PASS)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SMTP_HOST, SMTP_USER and SMTP_PASS are required when MAILER_PROVIDER=smtp.',
    });
  }
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper — override config without touching process.env. */
export function setConfigForTests(overrides: Partial<AppConfig>): void {
  cached = { ...loadConfig(), ...overrides };
}
