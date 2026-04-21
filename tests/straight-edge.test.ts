import { describe, expect, it } from 'vitest';
import {
  buildStraightEdgeLine,
  decideStraightEdgeCommit,
  straightEdgeEndpoint,
} from '$lib/tools/straightEdge';
import { snapAngleToStep } from '$lib/tools/lineSnap';
import type { StrokeStyle } from '$lib/types';

const STYLE: StrokeStyle = { color: '#123456', width: 3, dash: 'solid', opacity: 1 };

function angle(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

describe('snapAngleToStep', () => {
  it('snaps to a configurable step in degrees', () => {
    const start = { x: 0, y: 0 };
    const noisy = { x: 10 * Math.cos(0.4), y: 10 * Math.sin(0.4) };
    const snapped30 = snapAngleToStep(start, noisy, 30);
    expect(angle(start, snapped30)).toBeCloseTo((30 * Math.PI) / 180, 6);
    const snapped45 = snapAngleToStep(start, noisy, 45);
    expect(angle(start, snapped45)).toBeCloseTo((45 * Math.PI) / 180, 6);
  });

  it('returns endpoint unchanged when step is non-positive', () => {
    const end = { x: 7, y: 3 };
    expect(snapAngleToStep({ x: 0, y: 0 }, end, 0)).toEqual(end);
    expect(snapAngleToStep({ x: 0, y: 0 }, end, -15)).toEqual(end);
  });

  it('preserves segment length after snapping', () => {
    const start = { x: 1, y: 2 };
    const end = { x: 51, y: 29 };
    const snapped = snapAngleToStep(start, end, 15);
    const original = Math.hypot(end.x - start.x, end.y - start.y);
    const after = Math.hypot(snapped.x - start.x, snapped.y - start.y);
    expect(after).toBeCloseTo(original, 6);
  });
});

describe('straightEdgeEndpoint', () => {
  it('bypasses snap when bypassSnap is true', () => {
    const first = { x: 0, y: 0 };
    const current = { x: 12, y: 5 };
    const out = straightEdgeEndpoint({
      start: first,
      current,
      snapStepDeg: 15,
      bypassSnap: true,
    });
    expect(out).toEqual(current);
  });

  it('applies the configured snap step when not bypassed', () => {
    const first = { x: 0, y: 0 };
    const noisy = { x: 100 * Math.cos(0.05), y: 100 * Math.sin(0.05) };
    const out = straightEdgeEndpoint({
      start: first,
      current: noisy,
      snapStepDeg: 15,
      bypassSnap: false,
    });
    expect(angle(first, out)).toBeCloseTo(0, 6);
  });
});

describe('decideStraightEdgeCommit', () => {
  const baseInput = {
    shiftAtPointerUp: true,
    altAtPointerUp: false,
    rulerActive: false,
    tool: 'pen' as const,
    first: { x: 0, y: 0 },
    last: { x: 100, y: 3 },
    style: STYLE,
    snapStepDeg: 15,
  };

  it('commits a line when Shift is held at pointer-up for the pen', () => {
    const decision = decideStraightEdgeCommit(baseInput);
    expect(decision.kind).toBe('line');
    if (decision.kind !== 'line') return;
    expect(decision.from).toEqual({ x: 0, y: 0 });
    expect(angle(decision.from, decision.to)).toBeCloseTo(0, 6);
  });

  it('commits a line when Shift is held at pointer-up for the highlighter', () => {
    const decision = decideStraightEdgeCommit({ ...baseInput, tool: 'highlighter' });
    expect(decision.kind).toBe('line');
  });

  it('keeps the stroke commit when Shift is not held at pointer-up', () => {
    const decision = decideStraightEdgeCommit({ ...baseInput, shiftAtPointerUp: false });
    expect(decision.kind).toBe('stroke');
  });

  it('defers to ruler snap when ruler is active', () => {
    const decision = decideStraightEdgeCommit({ ...baseInput, rulerActive: true });
    expect(decision.kind).toBe('stroke');
  });

  it('does not trigger for non-pen tools', () => {
    const decision = decideStraightEdgeCommit({ ...baseInput, tool: 'eraser' });
    expect(decision.kind).toBe('stroke');
  });

  it('treats Alt as a snap bypass', () => {
    const noisy = { x: 100 * Math.cos(0.05), y: 100 * Math.sin(0.05) };
    const snapped = decideStraightEdgeCommit({ ...baseInput, last: noisy });
    const bypassed = decideStraightEdgeCommit({
      ...baseInput,
      last: noisy,
      altAtPointerUp: true,
    });
    expect(snapped.kind).toBe('line');
    expect(bypassed.kind).toBe('line');
    if (snapped.kind !== 'line' || bypassed.kind !== 'line') return;
    expect(angle(snapped.from, snapped.to)).toBeCloseTo(0, 6);
    expect(bypassed.to).toEqual(noisy);
  });

  it('falls back to stroke for zero-length shift drags', () => {
    const decision = decideStraightEdgeCommit({ ...baseInput, last: { x: 0, y: 0 } });
    expect(decision.kind).toBe('stroke');
  });
});

describe('buildStraightEdgeLine', () => {
  it('creates a LineObject with no arrowheads and a fresh style copy', () => {
    const line = buildStraightEdgeLine('abc', 123, { x: 0, y: 0 }, { x: 50, y: 50 }, STYLE);
    expect(line.type).toBe('line');
    expect(line.id).toBe('abc');
    expect(line.createdAt).toBe(123);
    expect(line.arrow).toEqual({ start: false, end: false });
    expect(line.style).toEqual(STYLE);
    expect(line.style).not.toBe(STYLE);
  });
});
