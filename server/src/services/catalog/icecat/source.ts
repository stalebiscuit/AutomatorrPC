/**
 * IcecatSpecSource (Task 3) — enriches KNOWN parts (Icecat is per-identifier, not
 * a category lister). Given identifiers (GTIN / brand+MPN / icecat_id), it fetches
 * + normalizes datasheets and upserts them into the shared catalogue. Build the
 * client from env via fromConfig().
 */
import type { BuilderCategory } from '@automatorr/shared';
import { ComponentModel } from '../../../models/index.js';
import { logger } from '../../../lib/logger.js';
import { loadConfig } from '../../../config.js';
import type { NormalizedPart } from '../ingest.js';
import { IcecatClient, IcecatError, type IcecatIdentifier } from './client.js';
import { normalizeIcecatProduct } from './normalize.js';

/** A part to enrich: an identifier plus which builder category to file it under. */
export interface IcecatSeed {
  category: BuilderCategory;
  id: IcecatIdentifier;
}

const CONTENT = ''; // empty = full datasheet (GeneralInfo + FeaturesGroups + Image)

export class IcecatSpecSource {
  readonly name = 'icecat';
  constructor(private readonly client: IcecatClient) {}

  /** Build from ICECAT_* env; throws if the username isn't configured. */
  static fromConfig(): IcecatSpecSource {
    const cfg = loadConfig();
    if (!cfg.ICECAT_USERNAME) {
      throw new IcecatError('ICECAT_USERNAME is not set — add it to server/.env');
    }
    return new IcecatSpecSource(
      new IcecatClient({
        username: cfg.ICECAT_USERNAME,
        ...(cfg.ICECAT_API_TOKEN ? { apiToken: cfg.ICECAT_API_TOKEN } : {}),
        ...(cfg.ICECAT_CONTENT_TOKEN ? { contentToken: cfg.ICECAT_CONTENT_TOKEN } : {}),
        ...(cfg.ICECAT_APP_KEY ? { appKey: cfg.ICECAT_APP_KEY } : {}),
        lang: cfg.ICECAT_LANG,
      }),
    );
  }

  /** Fetch + normalize a single product (null if it can't be identified). */
  async enrich(seed: IcecatSeed): Promise<NormalizedPart | null> {
    const data = await this.client.fetchProduct(seed.id, CONTENT);
    return normalizeIcecatProduct(data, seed.category);
  }

  /** Enrich many, isolating failures (one bad SKU never breaks the batch). */
  async enrichMany(seeds: IcecatSeed[]): Promise<NormalizedPart[]> {
    const out: NormalizedPart[] = [];
    for (const seed of seeds) {
      try {
        const part = await this.enrich(seed);
        if (part) out.push(part);
      } catch (err) {
        logger.warn(`[icecat] enrich failed for ${JSON.stringify(seed.id)}`, err);
      }
    }
    return out;
  }
}

/** Upsert enriched parts into the shared catalogue (keyed by category+slug). */
export async function upsertIcecatParts(parts: NormalizedPart[]): Promise<number> {
  const now = new Date();
  for (const p of parts) {
    await ComponentModel.updateOne(
      { category: p.category, slug: p.slug },
      {
        // Update Icecat-sourced fields; never clobber an existing part's
        // benchmark / performanceIndex / prices (set only on first insert).
        $set: {
          category: p.category,
          brand: p.brand,
          name: p.name,
          slug: p.slug,
          imageUrl: p.imageUrl,
          gtin: p.gtin ?? null,
          specs: p.specs,
          provenance: { specSourceUrl: p.specSourceUrl, seededAt: now, unknownFields: p.unknownFields },
        },
        $setOnInsert: {
          createdAt: now,
          benchmark: { ubRaw: 0, ubSource: 'icecat:non-benchmarked' },
          performanceIndex: 0,
          prices: [],
        },
      },
      { upsert: true },
    );
  }
  return parts.length;
}
