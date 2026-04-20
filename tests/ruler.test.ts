import { describe, expect, it } from 'vitest';
import {
  PT_PER_CM,
  PT_PER_INCH,
  ptPerUnit,
  rulerEnd,
  rulerTicks,
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
    expect(majors.at(-1)?.label).toBe('1');
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
