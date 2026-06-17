import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { CATEGORIES, type Category } from '@automatorr/shared';

const SpecValue = z.union([z.string(), z.number()]);

const SeedComponentSchema = z.object({
  brand: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  imageUrl: z.string().url().nullable().default(null),
  csv: z.object({ type: z.string().min(1), model: z.string().min(1) }),
  /** used when the CSV row is absent so the build still runs (Phase 2 task 4) */
  fallbackUbRaw: z.number().positive(),
  specs: z.record(SpecValue),
  specSourceUrl: z.string().url(),
  unknownFields: z.array(z.string()).default([]),
});

export type SeedComponent = z.infer<typeof SeedComponentSchema>;

const SeedFileSchema = z.object({
  category: z.enum(CATEGORIES),
  components: z.array(SeedComponentSchema).min(1),
});

export type SeedFile = z.infer<typeof SeedFileSchema>;

const DATA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'data');

export function loadSeedFile(category: Category): SeedFile {
  const path = join(DATA_DIR, `${category}.json`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const parsed = SeedFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid seed file ${category}.json:\n` +
        parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
  }
  if (parsed.data.category !== category) {
    throw new Error(`Seed file ${category}.json declares category "${parsed.data.category}"`);
  }
  return parsed.data;
}

export function loadAllSeedFiles(): SeedFile[] {
  return CATEGORIES.map(loadSeedFile);
}
