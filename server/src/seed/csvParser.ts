import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * UserBenchmark CSV ingestion.
 *
 * Column mapping (header: `Type,Part Number,Brand,Model,Rank,Benchmark,Samples,URL`):
 *   - Type      → discriminates CPU / GPU / SSD / HDD / RAM (storage uses Type)
 *   - Model     → the match key against a seed component's `csv.model`
 *   - Benchmark → `benchmark.ubRaw` (NEVER invented; taken verbatim)
 *   - URL       → `benchmark.ubSource`
 *
 * Rows are deduplicated by (Type, Model); the CSV is rank-sorted so the first
 * occurrence (best rank / most samples) wins.
 */

export interface CsvRow {
  type: string;
  partNumber: string;
  brand: string;
  model: string;
  rank: number;
  ubRaw: number;
  samples: number;
  url: string;
}

const CSV_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'csv');

const FILES: Record<string, string> = {
  CPU: 'CPU_UserBenchmarks.csv',
  GPU: 'GPU_UserBenchmarks.csv',
  SSD: 'SSD_UserBenchmarks.csv',
  HDD: 'HDD_UserBenchmarks.csv',
  RAM: 'RAM_UserBenchmarks.csv',
};

/** Minimal RFC-4180-ish line splitter (handles quoted fields defensively). */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function keyOf(type: string, model: string): string {
  return `${type.trim().toUpperCase()}::${model.trim().toLowerCase()}`;
}

export interface CsvIndex {
  /** (type, model) → row */
  byKey: Map<string, CsvRow>;
  rowCount: number;
  missingFiles: string[];
}

/** Parse one UB CSV type file into rows. Returns [] if the file is absent. */
export function parseCsvFile(type: string): CsvRow[] {
  const filename = FILES[type];
  if (!filename) return [];
  const path = join(CSV_DIR, filename);
  if (!existsSync(path)) return [];

  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i] as string);
    if (cols.length < 8) continue;
    const ubRaw = Number(cols[5]);
    if (!Number.isFinite(ubRaw)) continue;
    rows.push({
      type: (cols[0] ?? '').trim(),
      partNumber: (cols[1] ?? '').trim(),
      brand: (cols[2] ?? '').trim(),
      model: (cols[3] ?? '').trim(),
      rank: Number(cols[4]) || 0,
      ubRaw,
      samples: Number(cols[6]) || 0,
      url: (cols[7] ?? '').trim(),
    });
  }
  return rows;
}

/** Build a deduped (type, model) index across the requested CSV types. */
export function buildCsvIndex(types: string[]): CsvIndex {
  const byKey = new Map<string, CsvRow>();
  const missingFiles: string[] = [];
  let rowCount = 0;

  for (const type of types) {
    const filename = FILES[type];
    if (filename && !existsSync(join(CSV_DIR, filename))) {
      missingFiles.push(filename);
    }
    for (const row of parseCsvFile(type)) {
      rowCount++;
      const key = keyOf(row.type, row.model);
      if (!byKey.has(key)) byKey.set(key, row); // first (best rank) wins
    }
  }
  return { byKey, rowCount, missingFiles };
}

export function lookupCsv(index: CsvIndex, type: string, model: string): CsvRow | undefined {
  return index.byKey.get(keyOf(type, model));
}
