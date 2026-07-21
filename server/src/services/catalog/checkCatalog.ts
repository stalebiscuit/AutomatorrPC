/**
 * Curated-catalogue quality check (Task 3). Validates every part in the seed
 * datasets against the compatibility spec schema and flags gaps, duplicate slugs,
 * and canonical-key collisions — the guardrail that keeps a hand-curated dataset
 * clean and builder-ready. Run: npm run catalog:check
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDER_CATEGORIES, validateSpecs, type BuilderCategory, type Specs } from '@automatorr/shared';
import { canonicalKey } from './canonical.js';
import { logger } from '../../lib/logger.js';

const DATA_DIR = fileURLToPath(new URL('../../seed/data/', import.meta.url));

interface PartRow {
  brand: string;
  name: string;
  slug: string;
  specs: Specs;
}

function loadCategory(cat: BuilderCategory): PartRow[] {
  const raw = JSON.parse(readFileSync(join(DATA_DIR, `${cat}.json`), 'utf8')) as {
    components?: { brand: string; name: string; slug: string; specs?: Specs }[];
  };
  return (raw.components ?? []).map((c) => ({ brand: c.brand, name: c.name, slug: c.slug, specs: c.specs ?? {} }));
}

export interface CategoryReport {
  category: BuilderCategory;
  total: number;
  ready: number;
  notReady: { slug: string; missingCritical: string[] }[];
  dupSlugs: string[];
  keyCollisions: { key: string; slugs: string[] }[];
  error?: string;
}

export function checkCatalog(): CategoryReport[] {
  const reports: CategoryReport[] = [];
  for (const cat of BUILDER_CATEGORIES) {
    let rows: PartRow[];
    try {
      rows = loadCategory(cat);
    } catch (err) {
      reports.push({ category: cat, total: 0, ready: 0, notReady: [], dupSlugs: [], keyCollisions: [], error: (err as Error).message });
      continue;
    }
    const slugCount = new Map<string, number>();
    const keyMap = new Map<string, string[]>();
    const notReady: { slug: string; missingCritical: string[] }[] = [];
    for (const r of rows) {
      const v = validateSpecs(cat, r.specs);
      if (!v.builderReady) notReady.push({ slug: r.slug, missingCritical: v.missingCritical });
      slugCount.set(r.slug, (slugCount.get(r.slug) ?? 0) + 1);
      const key = canonicalKey(r.brand, r.name, cat);
      keyMap.set(key, [...(keyMap.get(key) ?? []), r.slug]);
    }
    reports.push({
      category: cat,
      total: rows.length,
      ready: rows.length - notReady.length,
      notReady,
      dupSlugs: [...slugCount].filter(([, n]) => n > 1).map(([s]) => s),
      keyCollisions: [...keyMap]
        .filter(([, slugs]) => new Set(slugs).size > 1)
        .map(([key, slugs]) => ({ key, slugs: [...new Set(slugs)] })),
    });
  }
  return reports;
}

async function main(): Promise<void> {
  const reports = checkCatalog();
  let problems = 0;
  for (const r of reports) {
    if (r.error) {
      logger.error(`[${r.category}] could not load: ${r.error}`);
      problems += 1;
      continue;
    }
    const issues: string[] = [];
    if (r.notReady.length) issues.push(`${r.notReady.length} missing critical specs`);
    if (r.dupSlugs.length) issues.push(`${r.dupSlugs.length} duplicate slug(s)`);
    if (r.keyCollisions.length) issues.push(`${r.keyCollisions.length} canonical-key collision(s)`);
    problems += r.notReady.length + r.dupSlugs.length + r.keyCollisions.length;
    logger.info(`[${r.category}] ${r.total} parts, ${r.ready} builder-ready` + (issues.length ? ` — ${issues.join('; ')}` : ' — clean'));
    for (const nr of r.notReady) logger.warn(`   ✗ ${nr.slug} missing: ${nr.missingCritical.join(', ')}`);
    for (const dup of r.dupSlugs) logger.warn(`   ✗ duplicate slug: ${dup}`);
    for (const col of r.keyCollisions) logger.warn(`   ✗ canonical collision ${col.key}: ${col.slugs.join(', ')}`);
  }
  const total = reports.reduce((n, r) => n + r.total, 0);
  logger.info(`Catalogue check complete — ${total} parts across ${reports.length} categories, ${problems} issue(s)`);
  process.exitCode = problems > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('catalog check failed', err);
    process.exitCode = 1;
  });
}
