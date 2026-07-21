/**
 * Pure compatibility solver (spec §6). Consumes a ResolvedBuild and returns
 * violations. HARD = never allowed to render/save as valid; SOFT = advisory.
 * v1 ships the "core checks"; deeper rules (QVL, PCIe lanes, connectors) are v2.
 *
 * This is the same function the AI agent calls as `check_compatibility(build)` —
 * one implementation, three consumers (client, server, agent).
 */
import type {
  BuilderCategory,
  Component,
  ResolvedBuild,
  Violation,
  CompatibilityResult,
  CompatibilityStatus,
} from './types.js';
import { num, str, csv, csvIncludes, moduleCount, normalizeSocket } from './specUtil.js';
import { estimateWattage } from './wattage.js';

function first(build: ResolvedBuild, category: BuilderCategory): Component | undefined {
  return build.find((b) => b.category === category)?.component;
}


/** Run the v1 core compatibility rules over a resolved build. */
export function checkCompatibility(build: ResolvedBuild): CompatibilityResult {
  const v: Violation[] = [];
  const cpu = first(build, 'cpu');
  const cooler = first(build, 'cooler');
  const mobo = first(build, 'motherboard');
  const ram = first(build, 'ram');
  const gpu = first(build, 'gpu');
  const pcCase = first(build, 'case');
  const psu = first(build, 'psu');

  // 1. CPU ↔ Motherboard socket (hard).
  if (cpu && mobo) {
    const cs = str(cpu, 'socket');
    const ms = str(mobo, 'socket');
    if (cs && ms && normalizeSocket(cs) !== normalizeSocket(ms)) {
      v.push({
        rule: 'cpu-mobo-socket',
        severity: 'hard',
        categories: ['cpu', 'motherboard'],
        message: `CPU socket ${cs} does not match motherboard socket ${ms}.`,
      });
    }
  }

  // 2. CPU Cooler ↔ CPU socket (hard).
  if (cooler && cpu) {
    const cs = str(cpu, 'socket');
    const supported = csv(cooler, 'socketSupport');
    const cpuSock = cs ? normalizeSocket(cs) : '';
    if (cs && supported.length && !supported.some((x) => normalizeSocket(x) === cpuSock)) {
      v.push({
        rule: 'cooler-cpu-socket',
        severity: 'hard',
        categories: ['cooler', 'cpu'],
        message: `Cooler does not list support for socket ${cs}.`,
      });
    }
  }

  // 3. RAM ↔ Motherboard: type (hard), module count vs slots (hard), speed (soft).
  if (ram && mobo) {
    const rt = str(ram, 'type');
    const mt = str(mobo, 'ramType');
    if (rt && mt && rt.toLowerCase() !== mt.toLowerCase()) {
      v.push({
        rule: 'ram-mobo-type',
        severity: 'hard',
        categories: ['ram', 'motherboard'],
        message: `${rt} memory is not compatible with a ${mt} motherboard.`,
      });
    }
    const slots = num(mobo, 'ramSlots');
    const modules = moduleCount(ram);
    if (slots !== undefined && modules > slots) {
      v.push({
        rule: 'ram-mobo-slots',
        severity: 'hard',
        categories: ['ram', 'motherboard'],
        message: `Memory kit has ${modules} modules but the motherboard has only ${slots} slots.`,
      });
    }
    const rs = num(ram, 'speedMTs');
    const maxs = num(mobo, 'maxRamSpeed');
    if (rs !== undefined && maxs !== undefined && rs > maxs) {
      v.push({
        rule: 'ram-mobo-speed',
        severity: 'soft',
        categories: ['ram', 'motherboard'],
        message: `Memory rated ${rs} MT/s exceeds the board's ${maxs} MT/s; it will run at the lower speed unless overclocked.`,
      });
    }
  }

  // 4. Motherboard ↔ Case form factor (hard).
  if (mobo && pcCase) {
    const ff = str(mobo, 'formFactor');
    const supported = csv(pcCase, 'formFactorSupport');
    if (ff && supported.length && !csvIncludes(pcCase, 'formFactorSupport', ff)) {
      v.push({
        rule: 'mobo-case-formfactor',
        severity: 'hard',
        categories: ['motherboard', 'case'],
        message: `Case does not support a ${ff} motherboard.`,
      });
    }
  }

  // 5. GPU length ↔ Case clearance (hard).
  if (gpu && pcCase) {
    const len = num(gpu, 'length');
    const maxLen = num(pcCase, 'maxGpuLength');
    if (len !== undefined && maxLen !== undefined && len > maxLen) {
      v.push({
        rule: 'gpu-case-length',
        severity: 'hard',
        categories: ['gpu', 'case'],
        message: `Graphics card is ${len} mm long but the case allows up to ${maxLen} mm.`,
      });
    }
  }

  // 6. Cooler clearance ↔ Case (air height hard; AIO radiator soft in v1).
  if (cooler && pcCase) {
    const type = (str(cooler, 'type') ?? '').toLowerCase();
    if (type === 'air') {
      const h = num(cooler, 'height');
      const maxH = num(pcCase, 'maxCoolerHeight');
      if (h !== undefined && maxH !== undefined && h > maxH) {
        v.push({
          rule: 'cooler-case-height',
          severity: 'hard',
          categories: ['cooler', 'case'],
          message: `Air cooler is ${h} mm tall but the case allows up to ${maxH} mm.`,
        });
      }
    } else if (type === 'aio') {
      const rad = num(cooler, 'radiatorSize');
      const supported = csv(pcCase, 'radiatorSupport');
      if (rad !== undefined && supported.length && !supported.map(Number).includes(rad)) {
        v.push({
          rule: 'cooler-case-radiator',
          severity: 'soft',
          categories: ['cooler', 'case'],
          message: `Case does not list support for a ${rad} mm radiator; verify mounting before buying.`,
        });
      }
    }
  }

  // 7. PSU headroom (under raw estimate = hard; under recommended = soft).
  if (psu) {
    const watts = num(psu, 'wattage');
    if (watts !== undefined) {
      const est = estimateWattage(build);
      if (watts < est) {
        v.push({
          rule: 'psu-underpowered',
          severity: 'hard',
          categories: ['psu'],
          message: `Power supply is ${watts} W but the build draws about ${est} W.`,
        });
      } else if (watts < est * 1.3) {
        v.push({
          rule: 'psu-headroom',
          severity: 'soft',
          categories: ['psu'],
          message: `Power supply is ${watts} W; ${Math.ceil((est * 1.3) / 50) * 50} W or more is recommended for headroom.`,
        });
      }
    }
  }

  return { status: statusOf(v), violations: v };
}

function statusOf(violations: Violation[]): CompatibilityStatus {
  if (violations.some((x) => x.severity === 'hard')) return 'incompatible';
  if (violations.some((x) => x.severity === 'soft')) return 'warnings';
  return 'ok';
}
