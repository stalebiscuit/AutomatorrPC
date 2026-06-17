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

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().min(1),

  PRICE_PROVIDER: z.enum(['scraper']).default('scraper'),
  VERDICT_PROVIDER: z.enum(['placeholder', 'claude']).default('placeholder'),

  SCRAPE_CRON: z.string().default('15 3 * * *'),
  SCRAPE_USER_AGENT: z
    .string()
    .default('AutomatorrPriceBot/1.0 (+https://automatorr.com/bot)'),
  ROLLUP_CRON: z.string().default('0 * * * *'),

  // Deferred (spec §14) — optional until the Claude provider is wired.
  ANTHROPIC_API_KEY: z.string().optional(),
  VERDICT_MODEL: z.string().default('claude-haiku-4-5-20251001'),
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

export const config: AppConfig = new Proxy({} as AppConfig, {
  get(_t, prop: string) {
    return loadConfig()[prop as keyof AppConfig];
  },
});
