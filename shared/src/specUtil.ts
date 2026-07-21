/**
 * Small, defensive readers over a Component's free-form `specs` map.
 * List-like specs (e.g. cooler socket support, case form-factor/radiator support)
 * are stored as comma-separated strings because Specs values are string | number.
 */
import type { Component } from './types.js';

/** Numeric spec value, or undefined when absent / non-numeric. */
export function num(c: Component, key: string): number | undefined {
  const v = c.specs[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && v.trim() !== '') return n;
  }
  return undefined;
}

/** String spec value (trimmed), or undefined when absent / empty. */
export function str(c: Component, key: string): string | undefined {
  const v = c.specs[key];
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number') return String(v);
  return undefined;
}

/** Comma-separated list spec → string[] (empty when absent). */
export function csv(c: Component, key: string): string[] {
  const v = str(c, key);
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Case-insensitive membership over a CSV list spec. */
export function csvIncludes(c: Component, key: string, needle: string): boolean {
  const nd = needle.trim().toLowerCase();
  return csv(c, key).some((x) => x.toLowerCase() === nd);
}

/**
 * Number of RAM modules in a kit. Reads an explicit `modules` spec if present,
 * else parses the leading integer of `kitConfig` (e.g. "2 × 16 GB" → 2).
 */
export function moduleCount(ram: Component): number {
  const explicit = num(ram, 'modules');
  if (explicit && explicit > 0) return Math.round(explicit);
  const kit = str(ram, 'kitConfig');
  if (kit) {
    const m = kit.match(/^\s*(\d+)\s*[x×*]/i);
    if (m) return parseInt(m[1]!, 10);
  }
  return 1;
}

/**
 * Normalise a socket string for cross-source comparison. CPUs & motherboards
 * store "LGA 1700" (spaced) while coolers store "LGA1700" — strip every
 * non-alphanumeric char and lowercase so all three sources compare equal.
 */
export function normalizeSocket(socket: string): string {
  return socket.replace(/[^a-z0-9]/gi, '').toLowerCase();
}
