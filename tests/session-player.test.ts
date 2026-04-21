import { describe, it, expect } from 'vitest';
import { chapterMarkers, nearestPageChangeAtOrBefore, replayStateAt } from '$lib/session/player';
import type { Point, StrokeObject, TextObject } from '$lib/types';
import type { SessionEvent } from '$lib/session/types';

function pt(x: number, t: number): Point {
  return { x, y: 0, pressure: 0.5, t };
}

function stroke(id: string, points: Point[]): StrokeObject {
  return {
    id,
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    points,
  };
}

function text(id: string, content = 'x'): TextObject {
  return {
    id,
    createdAt: 0,
    type: 'text',
    at: { x: 0, y: 0 },
    content,
    latex: false,
    fontSize: 16,
    color: '#000',
  };
}

describe('replayStateAt', () => {
  it('is empty at t=0 when the first event is after 0', () => {
    const events: SessionEvent[] = [{ kind: 'pageChange', t: 100, page: 0 }];
    const r = replayStateAt(events, 0);
    expect(r.byPage.size).toBe(0);
    expect(r.activeStrokes).toEqual([]);
    expect(r.currentPage).toBe(0);
    expect(r.cursor).toBe(0);
  });

  it('accumulates committed objects on their pages up to tMs', () => {
    const s1 = stroke('s1', [pt(0, 0), pt(1, 50)]);
    const t1 = text('t1');
    const events: SessionEvent[] = [
      { kind: 'pageChange', t: 0, page: 0 },
      { kind: 'stroke', t: 50, page: 0, stroke: s1 },
      { kind: 'objectAdd', t: 100, page: 0, obj: t1 },
      { kind: 'pageChange', t: 200, page: 1 },
      { kind: 'objectAdd', t: 250, page: 1, obj: text('t2') },
    ];
    const r = replayStateAt(events, 150);
    expect(r.currentPage).toBe(0);
    expect(r.byPage.get(0)?.map((o) => o.id)).toEqual(['s1', 't1']);
    expect(r.byPage.get(1)).toBeUndefined();
    expect(r.activeStrokes).toEqual([]);
  });

  it('renders mid-stroke as an active partial stroke', () => {
    const full = stroke('s1', [pt(0, 0), pt(1, 50), pt(2, 100), pt(3, 150)]);
    const events: SessionEvent[] = [
      { kind: 'pageChange', t: 0, page: 0 },
      // stroke end at t=1000 means it started at 1000 - 150 = 850
      { kind: 'stroke', t: 1000, page: 0, stroke: full },
    ];
    const mid = replayStateAt(events, 900);
    expect(mid.activeStrokes).toHaveLength(1);
    expect(mid.activeStrokes[0].points.map((p) => p.x)).toEqual([0, 1]);
    expect(mid.byPage.get(0) ?? []).toEqual([]);

    const after = replayStateAt(events, 1001);
    expect(after.activeStrokes).toEqual([]);
    expect(after.byPage.get(0)?.map((o) => o.id)).toEqual(['s1']);
  });

  it('only shows active strokes on the current page', () => {
    const s1 = stroke('s1', [pt(0, 0), pt(1, 50), pt(2, 100)]);
    const events: SessionEvent[] = [
      { kind: 'pageChange', t: 0, page: 0 },
      { kind: 'pageChange', t: 500, page: 1 },
      // Stroke committed on page 0 after user has navigated away — cannot happen
      // in practice but we guard against it.
      { kind: 'stroke', t: 1000, page: 0, stroke: s1 },
    ];
    const r = replayStateAt(events, 950);
    expect(r.currentPage).toBe(1);
    expect(r.activeStrokes).toEqual([]);
  });

  it('seek is idempotent: same tMs from 0 yields same state', () => {
    const events: SessionEvent[] = [
      { kind: 'pageChange', t: 0, page: 0 },
      { kind: 'objectAdd', t: 10, page: 0, obj: text('a') },
      { kind: 'objectAdd', t: 20, page: 0, obj: text('b') },
      { kind: 'objectDel', t: 30, page: 0, ids: ['a'] },
      { kind: 'pageChange', t: 40, page: 1 },
    ];
    const r1 = replayStateAt(events, 35);
    const r2 = replayStateAt(events, 35);
    expect(r1.byPage.get(0)?.map((o) => o.id)).toEqual(['b']);
    expect(r2.byPage.get(0)?.map((o) => o.id)).toEqual(['b']);
    expect(r1.currentPage).toBe(0);
  });

  it('applies objectUpdate in place', () => {
    const before = text('t1', 'old');
    const after = text('t1', 'new');
    const events: SessionEvent[] = [
      { kind: 'pageChange', t: 0, page: 0 },
      { kind: 'objectAdd', t: 10, page: 0, obj: before },
      { kind: 'objectUpdate', t: 20, page: 0, id: 't1', after },
    ];
    const r = replayStateAt(events, 25);
    const t = r.byPage.get(0)?.[0] as TextObject;
    expect(t.content).toBe('new');
  });
});

describe('chapterMarkers', () => {
  it('emits a marker at each distinct page change', () => {
    const events: SessionEvent[] = [
      { kind: 'pageChange', t: 0, page: 0 },
      { kind: 'pageChange', t: 100, page: 0 },
      { kind: 'pageChange', t: 200, page: 1 },
      { kind: 'pageChange', t: 300, page: 2 },
    ];
    expect(chapterMarkers(events)).toEqual([
      { t: 0, page: 0 },
      { t: 200, page: 1 },
      { t: 300, page: 2 },
    ]);
  });
});

describe('nearestPageChangeAtOrBefore', () => {
  it('returns 0 when no page change precedes tMs', () => {
    expect(nearestPageChangeAtOrBefore([], 100)).toBe(0);
  });
  it('returns the latest pageChange t <= tMs', () => {
    const events: SessionEvent[] = [
      { kind: 'pageChange', t: 0, page: 0 },
      { kind: 'pageChange', t: 500, page: 1 },
      { kind: 'pageChange', t: 1500, page: 2 },
    ];
    expect(nearestPageChangeAtOrBefore(events, 499)).toBe(0);
    expect(nearestPageChangeAtOrBefore(events, 500)).toBe(500);
    expect(nearestPageChangeAtOrBefore(events, 1000)).toBe(500);
    expect(nearestPageChangeAtOrBefore(events, 2000)).toBe(1500);
  });
});
