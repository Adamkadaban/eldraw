import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  angleMarkArcParams,
  angleMarkFromProtractor,
  type ProtractorState,
} from '$lib/geometry/protractor';
import { createDocumentStore } from '$lib/store/document';
import type { AngleMarkObject, EldrawDocument, Page } from '$lib/types';

const proto: ProtractorState = {
  center: { x: 100, y: 100 },
  radius: 140,
  rotation: 0,
  shape: 'semi',
};

function pdfPage(index: number): Page {
  return {
    pageIndex: index,
    type: 'pdf',
    insertedAfterPdfPage: null,
    width: 612,
    height: 792,
    objects: [],
  };
}

function docWithPages(pages: Page[]): EldrawDocument {
  return {
    version: 1,
    pdfHash: 'h',
    pdfPath: '/tmp/x.pdf',
    pages,
    palettes: [],
    prefs: {
      sidebarPinned: true,
      defaultTool: 'pen',
      toolDefaults: {
        pen: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
        highlighter: { color: '#ff0', width: 14, dash: 'solid', opacity: 0.3 },
        line: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
      },
    },
  };
}

function angleMark(id: string, degrees = 90): AngleMarkObject {
  const shape = angleMarkFromProtractor(proto, degrees, 40);
  return {
    id,
    createdAt: 0,
    type: 'angleMark',
    vertex: shape.vertex,
    rayA: shape.rayA,
    rayB: shape.rayB,
    degrees: shape.degrees,
    color: '#b38600',
    width: 1.5,
    showLabel: true,
  };
}

describe('angleMarkFromProtractor', () => {
  it('rayA lies on the 0° axis of the protractor', () => {
    const shape = angleMarkFromProtractor(proto, 90, 40);
    expect(shape.rayA.x).toBeCloseTo(140);
    expect(shape.rayA.y).toBeCloseTo(100);
  });

  it('rayB is rotated by spanDegrees from rayA about the vertex', () => {
    const shape = angleMarkFromProtractor(proto, 90, 40);
    expect(shape.rayB.x).toBeCloseTo(100);
    expect(shape.rayB.y).toBeCloseTo(140);
  });

  it('honors protractor rotation', () => {
    const rotated: ProtractorState = { ...proto, rotation: 90 };
    const shape = angleMarkFromProtractor(rotated, 45, 40);
    expect(shape.rayA.x).toBeCloseTo(100);
    expect(shape.rayA.y).toBeCloseTo(140);
    expect(shape.degrees).toBe(45);
  });

  it('preserves sign of span', () => {
    const shape = angleMarkFromProtractor(proto, -30, 40);
    expect(shape.degrees).toBe(-30);
  });
});

describe('angleMarkArcParams', () => {
  const vertex = { x: 0, y: 0 };
  const rayA = { x: 40, y: 0 };
  const rayB = { x: 0, y: 40 };

  it('start angle points along rayA from the vertex', () => {
    const arc = angleMarkArcParams(vertex, rayA, rayB, 90);
    expect(arc.startAngle).toBeCloseTo(0);
  });

  it('end angle equals start + sweep for positive degrees', () => {
    const arc = angleMarkArcParams(vertex, rayA, rayB, 90);
    expect(arc.endAngle).toBeCloseTo(Math.PI / 2);
    expect(arc.anticlockwise).toBe(false);
  });

  it('anticlockwise flag set for negative sweep', () => {
    const arc = angleMarkArcParams(vertex, rayA, { x: 0, y: -40 }, -90);
    expect(arc.anticlockwise).toBe(true);
    expect(arc.endAngle).toBeCloseTo(-Math.PI / 2);
  });

  it('radius defaults to a fraction of the shorter ray', () => {
    const arc = angleMarkArcParams(vertex, rayA, { x: 0, y: 80 }, 90);
    expect(arc.radius).toBeCloseTo(40 * 0.45);
  });

  it('explicit arcRadius overrides default', () => {
    const arc = angleMarkArcParams(vertex, rayA, rayB, 90, { arcRadius: 10 });
    expect(arc.radius).toBe(10);
  });

  it('labelAt sits on the bisector outside the arc', () => {
    const arc = angleMarkArcParams(vertex, rayA, rayB, 90);
    const labelRadius = Math.hypot(arc.labelAt.x, arc.labelAt.y);
    expect(labelRadius).toBeGreaterThan(arc.radius);
    const angle = Math.atan2(arc.labelAt.y, arc.labelAt.x);
    expect(angle).toBeCloseTo(Math.PI / 4);
  });
});

describe('angle mark document integration', () => {
  it('stores angleMark objects and survives an undo/redo cycle', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    const mark = angleMark('m1', 45);

    store.addObject(0, mark);
    expect(get(store)!.pages[0].objects).toHaveLength(1);
    const stored = get(store)!.pages[0].objects[0] as AngleMarkObject;
    expect(stored.type).toBe('angleMark');
    expect(stored.degrees).toBe(45);

    store.undo(0);
    expect(get(store)!.pages[0].objects).toHaveLength(0);

    store.redo(0);
    const redone = get(store)!.pages[0].objects[0] as AngleMarkObject;
    expect(redone.id).toBe('m1');
    expect(redone.degrees).toBe(45);
  });

  it('supports removeObject (eraser by id)', () => {
    const store = createDocumentStore();
    store.load(docWithPages([{ ...pdfPage(0), objects: [angleMark('m1')] }]));
    store.removeObject(0, 'm1');
    expect(get(store)!.pages[0].objects).toHaveLength(0);
    store.undo(0);
    expect(get(store)!.pages[0].objects).toHaveLength(1);
  });
});
