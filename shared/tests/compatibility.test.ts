import { describe, it, expect } from 'vitest';
import { checkCompatibility } from '../src/compatibility.js';
import { mkComponent, build, goodBuild } from './fixtures.js';

const rules = (r: ReturnType<typeof checkCompatibility>) => r.violations.map((v) => v.rule);

describe('compatibility — core rules (spec §6)', () => {
  it('reports OK for a fully compatible build', () => {
    const r = checkCompatibility(goodBuild());
    expect(r.status).toBe('ok');
    expect(r.violations).toHaveLength(0);
  });

  it('HARD: CPU/motherboard socket mismatch', () => {
    const cpu = mkComponent('cpu', { socket: 'AM5' });
    const mobo = mkComponent('motherboard', { socket: 'LGA1700', ramType: 'DDR5', ramSlots: 4 });
    const r = checkCompatibility(build(['cpu', cpu], ['motherboard', mobo]));
    expect(r.status).toBe('incompatible');
    expect(rules(r)).toContain('cpu-mobo-socket');
  });

  it('HARD: cooler does not support the CPU socket', () => {
    const cpu = mkComponent('cpu', { socket: 'AM5' });
    const cooler = mkComponent('cooler', { type: 'air', height: 150, socketSupport: 'LGA1700,LGA1851' });
    const r = checkCompatibility(build(['cpu', cpu], ['cooler', cooler]));
    expect(rules(r)).toContain('cooler-cpu-socket');
  });

  it('HARD: RAM type mismatch and too many modules for slots', () => {
    const mobo = mkComponent('motherboard', { socket: 'AM5', ramType: 'DDR5', ramSlots: 2 });
    const ram = mkComponent('ram', { type: 'DDR4', speedMTs: 3200, kitConfig: '4 × 8 GB' });
    const r = checkCompatibility(build(['motherboard', mobo], ['ram', ram]));
    expect(rules(r)).toContain('ram-mobo-type');
    expect(rules(r)).toContain('ram-mobo-slots');
  });

  it('SOFT: RAM faster than the board maximum', () => {
    const mobo = mkComponent('motherboard', { socket: 'AM5', ramType: 'DDR5', ramSlots: 4, maxRamSpeed: 5600 });
    const ram = mkComponent('ram', { type: 'DDR5', speedMTs: 6400, kitConfig: '2 × 16 GB' });
    const r = checkCompatibility(build(['motherboard', mobo], ['ram', ram]));
    expect(r.status).toBe('warnings');
    expect(rules(r)).toContain('ram-mobo-speed');
  });

  it('HARD: GPU longer than case clearance', () => {
    const gpu = mkComponent('gpu', { length: 340, tbp: 300 });
    const pcCase = mkComponent('case', { maxGpuLength: 300, formFactorSupport: 'ATX' });
    expect(rules(checkCompatibility(build(['gpu', gpu], ['case', pcCase])))).toContain('gpu-case-length');
  });

  it('HARD: motherboard form factor not supported by case', () => {
    const mobo = mkComponent('motherboard', { socket: 'AM5', ramType: 'DDR5', ramSlots: 4, formFactor: 'ATX' });
    const pcCase = mkComponent('case', { formFactorSupport: 'Mini-ITX', maxGpuLength: 360 });
    expect(rules(checkCompatibility(build(['motherboard', mobo], ['case', pcCase])))).toContain('mobo-case-formfactor');
  });

  it('HARD when PSU is under system draw; SOFT when under recommended headroom', () => {
    const cpu = mkComponent('cpu', { socket: 'AM5', tdp: 170 });
    const gpu = mkComponent('gpu', { tbp: 350, length: 300 });
    const under = checkCompatibility(build(['cpu', cpu], ['gpu', gpu], ['psu', mkComponent('psu', { wattage: 450 })]));
    expect(rules(under)).toContain('psu-underpowered');
    const tight = checkCompatibility(build(['cpu', cpu], ['gpu', gpu], ['psu', mkComponent('psu', { wattage: 600 })]));
    expect(rules(tight)).toContain('psu-headroom');
  });
});

describe('compatibility — socket format normalisation (regression: Intel false positive)', () => {
  it('does NOT flag an Intel CPU cooler when formats differ only by spacing', () => {
    // Real seed data: CPUs store "LGA 1700" (spaced), coolers store "LGA1700".
    const cpu = mkComponent('cpu', { socket: 'LGA 1700', tdp: 125 });
    const cooler = mkComponent('cooler', { type: 'air', height: 150, socketSupport: 'AM5,AM4,LGA1700,LGA1200' });
    const r = checkCompatibility(build(['cpu', cpu], ['cooler', cooler]));
    expect(rules(r)).not.toContain('cooler-cpu-socket');
  });

  it('matches a spaced CPU socket against a spaced motherboard socket', () => {
    const cpu = mkComponent('cpu', { socket: 'LGA 1700' });
    const mobo = mkComponent('motherboard', { socket: 'LGA 1700', ramType: 'DDR5', ramSlots: 4 });
    const r = checkCompatibility(build(['cpu', cpu], ['motherboard', mobo]));
    expect(rules(r)).not.toContain('cpu-mobo-socket');
  });

  it('still flags a genuinely unsupported socket', () => {
    const cpu = mkComponent('cpu', { socket: 'LGA 1200' });
    const cooler = mkComponent('cooler', { type: 'air', height: 150, socketSupport: 'AM5,AM4' });
    const r = checkCompatibility(build(['cpu', cpu], ['cooler', cooler]));
    expect(rules(r)).toContain('cooler-cpu-socket');
  });
});
