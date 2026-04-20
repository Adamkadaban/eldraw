import { describe, expect, it } from 'vitest';
import { angleAtPoint, protractorTicks, type ProtractorState } from '$lib/geometry/protractor';

const baseState: ProtractorState = {
  center: { x: 0, y: 0 },
  radius: 100,
  rotation: 0,
  shape: 'semi',
};

describe('protractor ticks', () => {
  it('semi protractor has 181 minor ticks at 1° default step', () => {
    const ticks = protractorTicks(baseState);
    expect(ticks.length).toBe(181);
  });

  it('full protractor has 361 minor ticks', () => {
    const ticks = protractorTicks({ ...baseState, shape: 'full' });
    expect(ticks.length).toBe(361);
  });

  it('major ticks carry labels every 10°', () => {
    const ticks = protractorTicks(baseState);
    const labelled = ticks.filter((t) => t.label !== null);
    expect(labelled.length).toBe(19);
    expect(labelled[0].label).toBe('0');
    expect(labelled.at(-1)?.label).toBe('180');
  });

  it('0° tick sits on +x at outer radius', () => {
    const ticks = protractorTicks(baseState);
    expect(ticks[0].outer.x).toBeCloseTo(100);
    expect(ticks[0].outer.y).toBeCloseTo(0);
  });

  it('rotation shifts tick positions', () => {
    const ticks = protractorTicks({ ...baseState, rotation: 90 });
    expect(ticks[0].outer.x).toBeCloseTo(0);
    expect(ticks[0].outer.y).toBeCloseTo(100);
  });
});

describe('angleAtPoint', () => {
  it('returns 0 along +x from center', () => {
    expect(angleAtPoint(baseState, { x: 10, y: 0 })).toBeCloseTo(0);
  });

  it('returns 90 along +y', () => {
    expect(angleAtPoint(baseState, { x: 0, y: 10 })).toBeCloseTo(90);
  });

  it('accounts for rotation', () => {
    const rotated: ProtractorState = { ...baseState, rotation: 45 };
    expect(angleAtPoint(rotated, { x: 10, y: 0 })).toBeCloseTo(315);
  });

  it('always returns a value in [0, 360)', () => {
    const a = angleAtPoint(baseState, { x: -10, y: -10 });
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
  });
});
