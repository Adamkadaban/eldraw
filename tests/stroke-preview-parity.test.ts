import { describe, it, expect } from 'vitest';
import { createOneEuroFilter, stabilizationToConfig } from '$lib/canvas/stabilizer';
import { strokeFromInput } from '$lib/tools/pen';
import type { Point, StrokeStyle } from '$lib/types';

/**
 * Issue #113: the live preview and the committed stroke must be point-identical.
 * LiveLayer feeds each coalesced raw sample through a per-stroke 1€ filter
 * and pushes the result into a single buffer. That same buffer is handed to
 * `strokeFromInput` on pointerup. This test reproduces that pipeline and
 * asserts the two point arrays match exactly.
 */

const style: StrokeStyle = {
  color: '#000',
  width: 2,
  opacity: 1,
  dash: 'solid',
};

function simulateStroke(amount: number, raw: Point[]) {
  const filter = createOneEuroFilter(stabilizationToConfig(amount));
  const preview: Point[] = [];
  for (const p of raw) {
    const f = filter.filter({ x: p.x, y: p.y }, p.t);
    preview.push({ x: f.x, y: f.y, pressure: p.pressure, t: p.t });
  }
  const committed = strokeFromInput(preview, style, 'pen');
  return { preview, committed };
}

describe('preview/commit parity', () => {
  it('at stabilization=0, committed points equal raw input', () => {
    const raw = Array.from({ length: 30 }, (_, i) => ({
      x: i * 3,
      y: Math.sin(i * 0.2) * 20,
      pressure: 0.5,
      t: i * 16,
    }));
    const { preview, committed } = simulateStroke(0, raw);
    expect(committed.points).toEqual(preview);
    expect(committed.points.map((p) => [p.x, p.y])).toEqual(raw.map((p) => [p.x, p.y]));
  });

  it('at high stabilization, committed points equal filtered preview exactly', () => {
    const raw = Array.from({ length: 50 }, (_, i) => ({
      x: i * 2 + (i % 2 === 0 ? 0.7 : -0.7),
      y: i + (i % 3 === 0 ? 0.5 : 0),
      pressure: 0.8,
      t: i * 16,
    }));
    const { preview, committed } = simulateStroke(80, raw);
    expect(committed.points).toEqual(preview);
    expect(committed.points).toHaveLength(raw.length);
  });

  it('fast strokes keep all samples — no RDP decimation', () => {
    const raw = Array.from({ length: 100 }, (_, i) => ({
      x: i * 12,
      y: i * 12,
      pressure: 0.9,
      t: i * 4,
    }));
    const { committed } = simulateStroke(50, raw);
    expect(committed.points).toHaveLength(raw.length);
  });
});
