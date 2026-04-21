import { describe, it, expect } from 'vitest';
import {
  mutationToSessionEvents,
  sliceStrokePointsUpTo,
  strokeDurationMs,
} from '$lib/session/events';
import type { Point, StrokeObject, TextObject } from '$lib/types';

function pt(x: number, t: number): Point {
  return { x, y: 0, pressure: 0.5, t };
}

function strokeWith(points: Point[]): StrokeObject {
  return {
    id: 's1',
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    points,
  };
}

function textObj(id: string): TextObject {
  return {
    id,
    createdAt: 0,
    type: 'text',
    at: { x: 0, y: 0 },
    content: 'hi',
    latex: false,
    fontSize: 16,
    color: '#000',
  };
}

describe('mutationToSessionEvents', () => {
  it('maps stroke add to a stroke event', () => {
    const s = strokeWith([pt(0, 0), pt(10, 100)]);
    const out = mutationToSessionEvents({ kind: 'add', pageIndex: 3, object: s }, 500);
    expect(out).toEqual([{ kind: 'stroke', t: 500, page: 3, stroke: s }]);
  });

  it('maps non-stroke add to objectAdd', () => {
    const t = textObj('t1');
    const out = mutationToSessionEvents({ kind: 'add', pageIndex: 0, object: t }, 1);
    expect(out).toEqual([{ kind: 'objectAdd', t: 1, page: 0, obj: t }]);
  });

  it('maps remove to objectDel and drops empty removes', () => {
    expect(mutationToSessionEvents({ kind: 'remove', pageIndex: 0, ids: ['a', 'b'] }, 100)).toEqual(
      [{ kind: 'objectDel', t: 100, page: 0, ids: ['a', 'b'] }],
    );
    expect(mutationToSessionEvents({ kind: 'remove', pageIndex: 0, ids: [] }, 100)).toEqual([]);
  });

  it('maps update to objectUpdate', () => {
    const t = textObj('t1');
    expect(
      mutationToSessionEvents({ kind: 'update', pageIndex: 2, id: 't1', after: t }, 50),
    ).toEqual([{ kind: 'objectUpdate', t: 50, page: 2, id: 't1', after: t }]);
  });
});

describe('strokeDurationMs', () => {
  it('returns the last point t', () => {
    expect(strokeDurationMs(strokeWith([pt(0, 0), pt(5, 200)]))).toBe(200);
  });
  it('zero for empty strokes', () => {
    expect(strokeDurationMs(strokeWith([]))).toBe(0);
  });
});

describe('sliceStrokePointsUpTo', () => {
  it('keeps only points with t <= cutoff', () => {
    const s = strokeWith([pt(0, 0), pt(1, 50), pt(2, 100), pt(3, 200)]);
    const sliced = sliceStrokePointsUpTo(s, 100);
    expect(sliced.points.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('keeps at least the first point for cutoff <= 0', () => {
    const s = strokeWith([pt(0, 0), pt(1, 50)]);
    expect(sliceStrokePointsUpTo(s, 0).points.map((p) => p.x)).toEqual([0]);
    expect(sliceStrokePointsUpTo(s, -10).points.map((p) => p.x)).toEqual([0]);
  });

  it('keeps the first point when all strictly exceed cutoff', () => {
    const s = strokeWith([pt(0, 100), pt(1, 200)]);
    expect(sliceStrokePointsUpTo(s, 50).points.map((p) => p.x)).toEqual([0]);
  });

  it('handles empty stroke', () => {
    expect(sliceStrokePointsUpTo(strokeWith([]), 100).points).toEqual([]);
  });
});
