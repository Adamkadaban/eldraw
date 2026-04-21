import { describe, it, expect } from 'vitest';
import { createOneEuroFilter, stabilizationToConfig } from '$lib/canvas/stabilizer';

describe('stabilizationToConfig', () => {
  it('at 0 returns a passthrough config (minCutoff=Infinity)', () => {
    const cfg = stabilizationToConfig(0);
    expect(cfg.minCutoff).toBe(Number.POSITIVE_INFINITY);
    expect(cfg.beta).toBe(0);
  });

  it('clamps negative and non-finite input to 0', () => {
    expect(stabilizationToConfig(-10).minCutoff).toBe(Number.POSITIVE_INFINITY);
    expect(stabilizationToConfig(Number.NaN).minCutoff).toBe(Number.POSITIVE_INFINITY);
  });

  it('produces a finite cutoff and non-zero beta at max', () => {
    const cfg = stabilizationToConfig(100);
    expect(Number.isFinite(cfg.minCutoff)).toBe(true);
    expect(cfg.minCutoff).toBeGreaterThan(0);
    expect(cfg.minCutoff).toBeLessThan(30);
    expect(cfg.beta).toBeGreaterThan(0);
  });

  it('cutoff decreases monotonically as amount rises', () => {
    const c = [0.1, 25, 50, 75, 100].map((a) => stabilizationToConfig(a).minCutoff);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeLessThan(c[i - 1]);
  });
});

describe('createOneEuroFilter', () => {
  it('is byte-identical passthrough at amount=0', () => {
    const filter = createOneEuroFilter(stabilizationToConfig(0));
    const samples = [
      { x: 10, y: 20 },
      { x: 10.1, y: 20.2 },
      { x: 33.33, y: -12.75 },
      { x: -0.00001, y: 999.99999 },
    ];
    for (let i = 0; i < samples.length; i++) {
      const out = filter.filter(samples[i], i * 16);
      expect(out.x).toBe(samples[i].x);
      expect(out.y).toBe(samples[i].y);
    }
  });

  it('emits the first sample unchanged regardless of config', () => {
    const filter = createOneEuroFilter(stabilizationToConfig(100));
    const out = filter.filter({ x: 42, y: -7 }, 0);
    expect(out.x).toBe(42);
    expect(out.y).toBe(-7);
  });

  it('significantly reduces jitter on a noisy slow stroke at max stabilization', () => {
    const filter = createOneEuroFilter(stabilizationToConfig(100));
    const samplesPerSec = 120;
    const dtMs = 1000 / samplesPerSec;
    const count = 200;

    let seed = 1;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 0x100000000) * 2 - 1;
    };

    const inputJitter: number[] = [];
    const outputJitter: number[] = [];
    let prevIn = 0;
    let prevOut = 0;
    for (let i = 0; i < count; i++) {
      const x = i * 0.05;
      const y = rand() * 0.5;
      const out = filter.filter({ x, y }, i * dtMs);
      if (i > 10) {
        inputJitter.push(Math.abs(y - prevIn));
        outputJitter.push(Math.abs(out.y - prevOut));
      }
      prevIn = y;
      prevOut = out.y;
    }

    const avgIn = inputJitter.reduce((a, b) => a + b, 0) / inputJitter.length;
    const avgOut = outputJitter.reduce((a, b) => a + b, 0) / outputJitter.length;
    expect(avgOut).toBeLessThan(avgIn * 0.2);
  });

  it('amount=100 smooths noticeably more than amount=50 on the same noisy input', () => {
    const samplesPerSec = 120;
    const dtMs = 1000 / samplesPerSec;
    const count = 200;

    const measureJitter = (amount: number) => {
      const filter = createOneEuroFilter(stabilizationToConfig(amount));
      let seed = 1;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return (seed / 0x100000000) * 2 - 1;
      };
      const jitter: number[] = [];
      let prev = 0;
      for (let i = 0; i < count; i++) {
        const out = filter.filter({ x: i * 0.05, y: rand() * 0.5 }, i * dtMs);
        if (i > 10) jitter.push(Math.abs(out.y - prev));
        prev = out.y;
      }
      return jitter.reduce((a, b) => a + b, 0) / jitter.length;
    };

    const avg50 = measureJitter(50);
    const avg100 = measureJitter(100);
    expect(avg100).toBeLessThan(avg50 * 0.7);
  });

  it('reset() clears state so a new stroke starts cold', () => {
    const filter = createOneEuroFilter(stabilizationToConfig(80));
    for (let i = 0; i < 20; i++) filter.filter({ x: 100 + i, y: 50 }, i * 16);
    filter.reset();
    const first = filter.filter({ x: 0, y: 0 }, 0);
    expect(first.x).toBe(0);
    expect(first.y).toBe(0);
  });

  it('remains bounded and non-overshooting with a large time delta', () => {
    const filter = createOneEuroFilter(stabilizationToConfig(50));
    const out1 = filter.filter({ x: 0, y: 0 }, 0);
    expect(out1).toEqual({ x: 0, y: 0 });
    const out2 = filter.filter({ x: 10, y: 10 }, 1000);
    expect(out2.x).toBeGreaterThan(0);
    expect(out2.x).toBeLessThanOrEqual(10);
  });
});
