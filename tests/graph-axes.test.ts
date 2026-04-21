import { describe, it, expect } from 'vitest';
import { niceStep, generateTicks, formatTick, tickDecimals, cappedStep } from '$lib/graph/axes';

describe('niceStep', () => {
  const cases: Array<[number, number]> = [
    [1, 8],
    [10, 8],
    [100, 8],
    [7, 8],
    [0.5, 8],
    [0.01, 8],
    [1234, 10],
    [0.0037, 6],
  ];

  it('returns a 1/2/5×10^k value for common ranges', () => {
    for (const [range, target] of cases) {
      const step = niceStep(range, target);
      expect(step).toBeGreaterThan(0);
      const exp = Math.floor(Math.log10(step));
      const m = step / 10 ** exp;
      expect([1, 2, 5]).toContain(Math.round(m));
    }
  });

  it('yields a tick count near the target', () => {
    for (const [range, target] of cases) {
      const step = niceStep(range, target);
      const count = range / step;
      expect(count).toBeGreaterThanOrEqual(Math.max(1, target / 4));
      expect(count).toBeLessThanOrEqual(target * 2);
    }
  });

  it('falls back safely for degenerate input', () => {
    expect(niceStep(0, 8)).toBe(1);
    expect(niceStep(-1, 8)).toBe(1);
    expect(niceStep(Infinity, 8)).toBe(1);
    expect(niceStep(NaN, 8)).toBe(1);
    expect(niceStep(Number.MIN_VALUE, 8)).toBe(1);
    expect(niceStep(1e-300, 1e300)).toBe(1);
    expect(niceStep(10, 0)).toBeGreaterThan(0);
    expect(niceStep(10, -1)).toBeGreaterThan(0);
    expect(niceStep(10, NaN)).toBeGreaterThan(0);
  });
});

describe('cappedStep', () => {
  it('returns the input step when the line count is within budget', () => {
    expect(cappedStep(10, 1, 200)).toBe(1);
    expect(cappedStep(100, 10, 200)).toBe(10);
  });

  it('coarsens when range / step exceeds the cap', () => {
    const step = cappedStep(10_000, 0.01, 200);
    expect(10_000 / step).toBeLessThanOrEqual(200);
    expect(step).toBeGreaterThan(0.01);
  });

  it('keeps the result of the form m × 10^k with m ∈ {1, 2, 5}', () => {
    const step = cappedStep(10_000, 0.01, 200);
    const exp = Math.floor(Math.log10(step));
    const m = Math.round(step / 10 ** exp);
    expect([1, 2, 5]).toContain(m);
  });

  it('handles degenerate inputs', () => {
    expect(cappedStep(0, 1, 200)).toBeGreaterThan(0);
    expect(cappedStep(NaN, 1, 200)).toBeGreaterThan(0);
    expect(cappedStep(10, 0, 200)).toBeGreaterThan(0);
    expect(cappedStep(10, -1, 200)).toBeGreaterThan(0);
    expect(cappedStep(10, 1, 0)).toBe(1);
  });
});

describe('generateTicks', () => {
  it('emits ticks at multiples of a nice step across a symmetric range', () => {
    const ticks = generateTicks(-5, 5);
    expect(ticks[0]).toBeCloseTo(-5);
    expect(ticks[ticks.length - 1]).toBeCloseTo(5);
    expect(ticks).toContain(0);
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks.length).toBeLessThanOrEqual(15);
  });

  it('honours an explicit step', () => {
    expect(generateTicks(-3, 3, 1)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(generateTicks(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('stays empty for invalid ranges', () => {
    expect(generateTicks(1, 1)).toEqual([]);
    expect(generateTicks(5, 1)).toEqual([]);
    expect(generateTicks(NaN, 1)).toEqual([]);
  });

  it('keeps tick count within target bounds for common ranges', () => {
    for (const range of [0.1, 0.5, 1, 7, 10, 100, 1000]) {
      const ticks = generateTicks(0, range);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(20);
    }
  });
});

describe('formatTick', () => {
  it('drops trailing decimals when step is integral', () => {
    expect(formatTick(5, 1)).toBe('5');
    expect(formatTick(-0, 1)).toBe('0');
  });

  it('keeps decimals for sub-unit steps', () => {
    expect(formatTick(0.25, 0.25)).toBe('0.25');
    expect(formatTick(0.1, 0.1)).toBe('0.1');
  });

  it('matches tickDecimals for small steps', () => {
    expect(tickDecimals(0.001)).toBe(3);
    expect(tickDecimals(10)).toBe(0);
  });
});
