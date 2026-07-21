/**
 * Canonical spec schema (Task 3 §4). Declares, per builder category, which
 * compatibility fields a part must carry. `critical` fields are the ones the
 * compatibility/fit engine can't work without — a part missing any is gated out
 * of the builder (isBuilderReady === false). Pure + dependency-free.
 */
import type { BuilderCategory, Component, Specs } from './types.js';

export type SpecKind = 'string' | 'number' | 'list';
export type SpecLevel = 'critical' | 'required' | 'optional';

export interface SpecFieldDef {
  key: string;
  kind: SpecKind;
  level: SpecLevel;
}

export const CATEGORY_SPEC_SCHEMA: Record<BuilderCategory, SpecFieldDef[]> = {
  cpu: [
    { key: 'socket', kind: 'string', level: 'critical' },
    { key: 'tdp', kind: 'number', level: 'required' },
    { key: 'cores', kind: 'number', level: 'optional' },
    { key: 'boostClock', kind: 'number', level: 'optional' },
    { key: 'igpu', kind: 'string', level: 'optional' },
  ],
  cooler: [
    { key: 'type', kind: 'string', level: 'critical' },
    { key: 'socketSupport', kind: 'list', level: 'critical' },
    { key: 'height', kind: 'number', level: 'required' },
    { key: 'radiatorSize', kind: 'number', level: 'optional' },
    { key: 'tdpRating', kind: 'number', level: 'optional' },
    { key: 'color', kind: 'string', level: 'optional' },
  ],
  motherboard: [
    { key: 'socket', kind: 'string', level: 'critical' },
    { key: 'ramType', kind: 'string', level: 'critical' },
    { key: 'formFactor', kind: 'string', level: 'critical' },
    { key: 'ramSlots', kind: 'number', level: 'required' },
    { key: 'maxRamSpeed', kind: 'number', level: 'optional' },
    { key: 'chipset', kind: 'string', level: 'optional' },
    { key: 'm2Slots', kind: 'number', level: 'optional' },
  ],
  ram: [
    { key: 'type', kind: 'string', level: 'critical' },
    { key: 'speedMTs', kind: 'number', level: 'required' },
    { key: 'kitConfig', kind: 'string', level: 'required' },
    { key: 'capacity', kind: 'number', level: 'optional' },
    { key: 'casLatency', kind: 'number', level: 'optional' },
    { key: 'color', kind: 'string', level: 'optional' },
  ],
  storage: [
    { key: 'subtype', kind: 'string', level: 'required' },
    { key: 'capacity', kind: 'number', level: 'required' },
    { key: 'formFactor', kind: 'string', level: 'required' },
    { key: 'interface', kind: 'string', level: 'optional' },
  ],
  gpu: [
    { key: 'length', kind: 'number', level: 'critical' },
    { key: 'tbp', kind: 'number', level: 'required' },
    { key: 'vram', kind: 'number', level: 'required' },
    { key: 'vramType', kind: 'string', level: 'optional' },
    { key: 'color', kind: 'string', level: 'optional' },
  ],
  case: [
    { key: 'formFactorSupport', kind: 'list', level: 'critical' },
    { key: 'maxGpuLength', kind: 'number', level: 'critical' },
    { key: 'maxCoolerHeight', kind: 'number', level: 'critical' },
    { key: 'radiatorSupport', kind: 'list', level: 'optional' },
    { key: 'color', kind: 'string', level: 'optional' },
  ],
  psu: [
    { key: 'wattage', kind: 'number', level: 'critical' },
    { key: 'efficiency', kind: 'string', level: 'optional' },
    { key: 'modular', kind: 'string', level: 'optional' },
    { key: 'formFactor', kind: 'string', level: 'optional' },
  ],
  monitor: [
    { key: 'resolution', kind: 'string', level: 'required' },
    { key: 'refreshHz', kind: 'number', level: 'required' },
    { key: 'size', kind: 'number', level: 'optional' },
    { key: 'panelType', kind: 'string', level: 'optional' },
  ],
};

function present(specs: Specs, def: SpecFieldDef): boolean {
  const v = specs[def.key];
  if (def.kind === 'number') {
    if (typeof v === 'number') return Number.isFinite(v);
    return typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));
  }
  if (def.kind === 'list') {
    return typeof v === 'string' && v.split(',').map((s) => s.trim()).filter(Boolean).length > 0;
  }
  return (typeof v === 'string' && v.trim() !== '') || typeof v === 'number';
}

export interface SpecValidation {
  /** true when no critical field is missing — usable in the builder */
  builderReady: boolean;
  /** critical or required fields absent */
  missing: string[];
  /** critical fields absent (the gating set) */
  missingCritical: string[];
}

/** Validate a specs map against its category schema. */
export function validateSpecs(category: BuilderCategory, specs: Specs): SpecValidation {
  const defs = CATEGORY_SPEC_SCHEMA[category] ?? [];
  const missing: string[] = [];
  const missingCritical: string[] = [];
  for (const def of defs) {
    if (def.level === 'optional') continue;
    if (!present(specs, def)) {
      missing.push(def.key);
      if (def.level === 'critical') missingCritical.push(def.key);
    }
  }
  return { builderReady: missingCritical.length === 0, missing, missingCritical };
}

/** A part is builder-ready when it has all critical compatibility fields. */
export function isBuilderReady(component: Component): boolean {
  return validateSpecs(component.category, component.specs).missingCritical.length === 0;
}
