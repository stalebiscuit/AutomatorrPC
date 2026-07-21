import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { BUILDER_CATEGORIES, CATEGORIES, type BuilderCategory } from '@automatorr/shared';

/** Builder-only categories (everything the comparison tool never seeded). */
export const BUILDER_ONLY_CATEGORIES: BuilderCategory[] = BUILDER_CATEGORIES.filter(
  (c) => !(CATEGORIES as readonly string[]).includes(c),
);

const SpecValue = z.union([z.string(), z.number()]);

const SeedPriceSchema = z.object({
  store: z.string().min(1),
  price: z.number().positive(),
  url: z.string().url(),
});

/** Non-benchmarked catalogue part (no UB CSV / performance index). */
const BuilderSeedComponentSchema = z.object({
  brand: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  imageUrl: z
    .union([z.string().url(), z.string().regex(/^\/[\w./-]+$/, 'root-relative asset path')])
    .nullable()
    .default(null),
  specs: z.record(SpecValue),
  specSourceUrl: z.string().url(),
  unknownFields: z.array(z.string()).default([]),
  prices: z.array(SeedPriceSchema).default([]),
});

export type BuilderSeedComponent = z.infer<typeof BuilderSeedComponentSchema>;

const BuilderSeedFileSchema = z.object({
  category: z.enum(BUILDER_CATEGORIES),
  components: z.array(BuilderSeedComponentSchema).min(1),
});
export type BuilderSeedFile = z.infer<typeof BuilderSeedFileSchema>;

const DATA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'data');

export function loadBuilderSeedFile(category: BuilderCategory): BuilderSeedFile {
  const path = join(DATA_DIR, `${category}.json`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const parsed = BuilderSeedFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid builder seed file ${category}.json:\n` +
        parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
  }
  if (parsed.data.category !== category) {
    throw new Error(`Seed file ${category}.json declares category "${parsed.data.category}"`);
  }
  return parsed.data;
}
