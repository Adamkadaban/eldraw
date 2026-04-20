import { describe, expect, it } from 'vitest';
import {
  PT_PER_CM,
  PT_PER_INCH,
  distanceToSegment,
  projectOntoLine,
  ptPerUnit,
  rulerEdge,
  rulerEnd,
  rulerTicks,
  snapPointToRuler,
  snapStrokeToRuler,
  type RulerState,
} from '$lib/geometry/ruler';

const base: RulerState = {
  from: { x: 0, y: 0 },
  rotation: 0,
  length: PT_PER_CM * 10,
  unit: 'cm',
};

describe('ptPerUnit', () => {
  it('knows inches and centimetres', () => {
    expect(ptPerUnit('pt')).toBe(1);
    expect(ptPerUnit('in')).toBe(PT_PER_INCH);
    expect(ptPerUnit('cm')).toBeCloseTo(PT_PER_CM);
  });
});

describe('rulerTicks', () => {
  it('emits 11 cm ticks (0..10 inclusive) for a 10cm ruler', () => {
    const ticks = rulerTicks(base);
    expect(ticks.length).toBe(11);
  });

  it('marks every 10cm tick as major by default', () => {
    const ticks = rulerTicks(base);
    const majors = ticks.filter((t) => t.isMajor);
    expect(majors.length).toBe(2);
    expect(majors[0].along).toBe(0);
  });

  it('labels major ticks with the cm count', () => {
    const ticks = rulerTicks(base);
    const majors = ticks.filter((t) => t.isMajor);
    expect(majors[0].label).toBe('0');
    expect(majors.at(-1)?.label).toBe('10');
  });

  it('rotation shifts tick root positions', () => {
    const ticks = rulerTicks({ ...base, rotation: 90 });
    expect(ticks[1].root.x).toBeCloseTo(0);
    expect(ticks[1].root.y).toBeCloseTo(PT_PER_CM);
  });

  it('inch ruler emits 16 minor ticks per inch', () => {
    const inchRuler: RulerState = {
      from: { x: 0, y: 0 },
      rotation: 0,
      length: PT_PER_INCH * 2,
      unit: 'in',
    };
    const ticks = rulerTicks(inchRuler);
    expect(ticks.length).toBe(33);
    const majors = ticks.filter((t) => t.isMajor);
    expect(majors.length).toBe(3);
  });
});

describe('rulerEnd', () => {
  it('returns from + length along +x for zero rotation', () => {
    const end = rulerEnd({ from: { x: 5, y: 7 }, rotation: 0, length: 100, unit: 'pt' });
    expect(end).toEqual({ x: 105, y: 7 });
  });

  it('applies rotation around from', () => {
    const end = rulerEnd({ from: { x: 0, y: 0 }, rotation: 90, length: 100, unit: 'pt' });
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(100);
  });
});

describe('rulerEdge', () => {
  it('returns from and computed end', () => {
    const { a, b } = rulerEdge(base);
    expect(a).toEqual({ x: 0, y: 0 });
    expect(b.x).toBeCloseTo(PT_PER_CM * 10);
    expect(b.y).toBeCloseTo(0);
  });
});

describe('projectOntoLine', () => {
  it('drops a perpendicular onto a horizontal line', () => {
    const p = projectOntoLine({ x: 40, y: 30 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(p).toEqual({ x: 40, y: 0 });
  });

  it('projects past segment ends along the infinite line', () => {
    const p = projectOntoLine({ x: 150, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(p.x).toBeCloseTo(150);
    expect(p.y).toBeCloseTo(0);
  });

  it('returns `a` for a degenerate line', () => {
    const p = projectOntoLine({ x: 5, y: 5 }, { x: 2, y: 3 }, { x: 2, y: 3 });
    expect(p).toEqual({ x: 2, y: 3 });
  });
});

describe('distanceToSegment', () => {
  it('measures perpendicular distance above the segment', () => {
    expect(distanceToSegment({ x: 50, y: 7 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(7);
  });

  it('clamps to endpoint when past an end', () => {
    expect(distanceToSegment({ x: 110, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(10);
  });
});

describe('snapPointToRuler', () => {
  it('snaps a point within the threshold onto the ruler line', () => {
    const res = snapPointToRuler({ x: 50, y: 5 }, base, 12);
    expect(res.snapped).toBe(true);
    expect(res.point.y).toBeCloseTo(0);
    expect(res.point.x).toBeCloseTo(50);
  });

  it('leaves a far point unchanged', () => {
    const far = { x: 50, y: 80 };
    const res = snapPointToRuler(far, base, 12);
    expect(res.snapped).toBe(false);
    expect(res.point).toEqual(far);
  });

  it('does not snap past segment ends when far perpendicular', () => {
    const res = snapPointToRuler({ x: -50, y: 20 }, base, 12);
    expect(res.snapped).toBe(false);
  });

  it('snaps along a rotated ruler', () => {
    const rotated: RulerState = { ...base, rotation: 90 };
    const res = snapPointToRuler({ x: 6, y: 40 }, rotated, 12);
    expect(res.snapped).toBe(true);
    expect(res.point.x).toBeCloseTo(0);
    expect(res.point.y).toBeCloseTo(40);
  });
});

describe('snapStrokeToRuler', () => {
  it('produces collinear points when every input is within threshold', () => {
    const pts = [
      { x: 10, y: 3, pressure: 0.5, t: 0 },
      { x: 30, y: -2, pressure: 0.5, t: 10 },
      { x: 50, y: 4, pressure: 0.5, t: 20 },
      { x: 70, y: 1, pressure: 0.5, t: 30 },
    ];
    const snapped = snapStrokeToRuler(pts, base, 12);
    for (const p of snapped) {
      expect(p.y).toBeCloseTo(0);
    }
    snapped.forEach((p, i) => expect(p.x).toBeCloseTo(pts[i].x));
  });

  it('preserves per-point pressure and timestamps', () => {
    const pts = [{ x: 20, y: 2, pressure: 0.7, t: 42 }];
    const [p] = snapStrokeToRuler(pts, base, 12);
    expect(p.pressure).toBe(0.7);
    expect(p.t).toBe(42);
  });

  it('leaves points outside threshold untouched but snaps ones inside', () => {
    const pts = [
      { x: 10, y: 3 },
      { x: 30, y: 50 },
      { x: 50, y: -4 },
    ];
    const snapped = snapStrokeToRuler(pts, base, 12);
    expect(snapped[0].y).toBeCloseTo(0);
    expect(snapped[1]).toEqual(pts[1]);
    expect(snapped[2].y).toBeCloseTo(0);
  });
});
