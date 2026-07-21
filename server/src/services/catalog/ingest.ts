import type { BuilderCategory, Specs } from '@automatorr/shared';
import { validateSpecs } from '@automatorr/shared';
import { ComponentModel } from '../../models/index.js';
import { logger } from '../../lib/logger.js';
import { loadBuilderSeedFile, BUILDER_ONLY_CATEGORIES } from '../../seed/builderSeedData.js';

/**
 * Catalogue ingestion pipeline (plan §4.1.1). A SpecSource yields normalised
 * parts for a category; the pipeline upserts them into the shared Component
 * collection and reports SKUs present in the DB but absent from the source
 * (EOL candidates). Swap DatasetSpecSource for a live spec/retailer feed to get
 * "auto-updated as new parts launch" without touching the writer.
 */
export interface NormalizedPrice {
  store: string;
  price: number;
  url: string;
}
export interface NormalizedPart {
  category: BuilderCategory;
  brand: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  gtin?: string | null;
  specs: Specs;
  specSourceUrl: string;
  unknownFields: string[];
  prices: NormalizedPrice[];
}

export interface SpecSource {
  readonly name: string;
  fetchParts(category: BuilderCategory): Promise<NormalizedPart[]>;
}

/** Default source — reads the bundled builder seed datasets. */
export class DatasetSpecSource implements SpecSource {
  readonly name = 'dataset';
  fetchParts(category: BuilderCategory): Promise<NormalizedPart[]> {
    const file = loadBuilderSeedFile(category);
    return Promise.resolve(
      file.components.map((c) => ({
        category,
        brand: c.brand,
        name: c.name,
        slug: c.slug,
        imageUrl: c.imageUrl ?? null,
        gtin: (c as { gtin?: string | null }).gtin ?? null,
        specs: c.specs,
        specSourceUrl: c.specSourceUrl,
        unknownFields: c.unknownFields,
        prices: c.prices,
      })),
    );
  }
}

export interface IngestSummary {
  category: BuilderCategory;
  upserted: number;
  /** slugs in the DB for this category that the source no longer lists */
  staleSkus: string[];
  /** parts missing critical compatibility fields (gated out of the builder) */
  flagged: { slug: string; missingCritical: string[] }[];
}

export async function ingestCategory(
  source: SpecSource,
  category: BuilderCategory,
): Promise<IngestSummary> {
  const parts = await source.fetchParts(category);
  const now = new Date();
  const seen = new Set<string>();

  const flagged: { slug: string; missingCritical: string[] }[] = [];
  for (const p of parts) {
    seen.add(p.slug);
    const quality = validateSpecs(category, p.specs);
    if (!quality.builderReady) flagged.push({ slug: p.slug, missingCritical: quality.missingCritical });
    await ComponentModel.updateOne(
      { category, slug: p.slug },
      {
        $set: {
          category,
          brand: p.brand,
          name: p.name,
          slug: p.slug,
          imageUrl: p.imageUrl,
          gtin: p.gtin ?? null,
          specs: p.specs,
          // non-benchmarked categories carry a nominal index (excluded from scoring)
          benchmark: { ubRaw: 0, ubSource: `${source.name}:non-benchmarked` },
          performanceIndex: 0,
          prices: p.prices.map((q) => ({
            store: q.store,
            price: q.price,
            currency: 'AUD',
            url: q.url,
            lastUpdated: now,
          })),
          provenance: {
            specSourceUrl: p.specSourceUrl,
            seededAt: now,
            unknownFields: p.unknownFields,
          },
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  const existing = await ComponentModel.find({ category }).select('slug').lean();
  const staleSkus = existing.map((d) => d.slug as string).filter((s) => !seen.has(s));
  return { category, upserted: parts.length, staleSkus, flagged };
}

/** Ingest every builder-only category from a source (default = bundled dataset). */
export async function ingestBuilderCatalog(
  source: SpecSource = new DatasetSpecSource(),
): Promise<IngestSummary[]> {
  const summaries: IngestSummary[] = [];
  for (const category of BUILDER_ONLY_CATEGORIES) {
    const s = await ingestCategory(source, category);
    summaries.push(s);
    logger.info(
      `[ingest:${category}] upserted ${s.upserted}` +
        (s.staleSkus.length ? ` — ${s.staleSkus.length} EOL candidate(s): ${s.staleSkus.join(', ')}` : '') +
        (s.flagged.length ? ` — ${s.flagged.length} missing critical specs (gated): ${s.flagged.map((f) => f.slug).join(', ')}` : ''),
    );
  }
  return summaries;
}
