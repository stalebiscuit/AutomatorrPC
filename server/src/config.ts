import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

/**
 * Per-environment env loading (CI/CD refactor, 22 Jul 2026).
 *
 * The same codebase runs on a dev laptop, the Test VM and the Prod VM without
 * code changes: NODE_ENV selects which file loads. Files live in the server
 * package dir (server/.env.<env>), resolved relative to THIS module so the CWD
 * never matters — workspace scripts run with CWD=server/, the prod bundle runs
 * from server/dist/. Load order (dotenv never overrides an already-set var, so
 * earlier wins): the env-specific file, then a plain server/.env, then whatever
 * the process CWD provides. Real production env vars (set by PM2/systemd) beat
 * all of them.
 */
const moduleDir = dirname(fileURLToPath(import.meta.url));
// server/src/config.ts (dev, tsx) and server/dist/*.js (prod bundle) both sit
// one dir below the server package root.
const serverRoot = resolve(moduleDir, '..');
const nodeEnv = process.env.NODE_ENV || 'development';
loadEnv({ path: resolve(serverRoot, `.env.${nodeEnv}`) });
loadEnv({ path: resolve(serverRoot, '.env') });
loadEnv();

/**
 * Back-compat normalisation: the .env files use the Clockit-aligned key names
 * (MONGO_URI, CLIENT_URL/APP_URL) while the validated schema below keeps its
 * original property names so the ~30 consumers don't have to change. Copy the
 * new-name value into the old name only when the old one isn't already set, so
 * either naming works and nothing silently breaks during the migration.
 */
function alias(canonical: string, ...aliases: string[]): void {
  if (process.env[canonical]) return;
  for (const a of aliases) {
    if (process.env[a]) {
      process.env[canonical] = process.env[a];
      return;
    }
  }
}
alias('MONGODB_URI', 'MONGO_URI');
alias('CLIENT_ORIGIN', 'CLIENT_URL', 'APP_URL');

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
  // Fallback symmetric secret (HS256) used only when no RS256 keypair is set.
  // Lets an environment run auth with a single shared secret instead of a
  // keypair. RS256 keypair, when present, always takes precedence.
  JWT_SECRET: z.string().optional(),

  // Founders — locked super-admins (comma-separated emails).
  SUPERADMIN_EMAILS: z
    .string()
    .default('daniel.hardman@automatorr.com,abishai.bajaj@automatorr.com'),

  // OTP email delivery. `graph` = Microsoft Graph sendMail (app-only / client
  // credentials); `smtp` = nodemailer; `console` = log to server (dev/test).
  MAILER_PROVIDER: z.enum(['console', 'smtp', 'graph']).default('console'),
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

  // Microsoft Graph mailer (MAILER_PROVIDER=graph). App registration with the
  // application permission Mail.Send granted + admin-consented. OTP_FROM is the
  // sender mailbox (must be a real mailbox the app is allowed to send as).
  GRAPH_TENANT_ID: z.string().optional(),
  GRAPH_CLIENT_ID: z.string().optional(),
  GRAPH_CLIENT_SECRET: z.string().optional(),

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
  const hasKeypair = Boolean(cfg.ADMIN_JWT_PRIVATE_KEY && cfg.ADMIN_JWT_PUBLIC_KEY);
  const hasSecret = Boolean(cfg.JWT_SECRET);
  if (!hasKeypair && !hasSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Production auth needs either an RS256 keypair (ADMIN_JWT_PRIVATE_KEY + ADMIN_JWT_PUBLIC_KEY, run `npm run generate-keys`) or a JWT_SECRET fallback.',
    });
  }
  if (cfg.MAILER_PROVIDER === 'smtp' && (!cfg.SMTP_HOST || !cfg.SMTP_USER || !cfg.SMTP_PASS)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SMTP_HOST, SMTP_USER and SMTP_PASS are required when MAILER_PROVIDER=smtp.',
    });
  }
  if (
    cfg.MAILER_PROVIDER === 'graph' &&
    (!cfg.GRAPH_TENANT_ID || !cfg.GRAPH_CLIENT_ID || !cfg.GRAPH_CLIENT_SECRET)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'GRAPH_TENANT_ID, GRAPH_CLIENT_ID and GRAPH_CLIENT_SECRET are required when MAILER_PROVIDER=graph.',
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
