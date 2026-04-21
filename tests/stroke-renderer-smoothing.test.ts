import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StrokeObject } from '$lib/types';
import { streamlineFromSmoothing } from '$lib/store/sidebar';

type StrokeOptions = { streamline?: number };
const getStroke = vi.fn<(points: number[][], opts: StrokeOptions) => number[][]>(() => [
  [0, 0],
  [1, 1],
]);

vi.mock('perfect-freehand', () => ({
  getStroke: (points: number[][], opts: StrokeOptions) => getStroke(points, opts),
}));

class FakePath2D {}

function makeCtx(): CanvasRenderingContext2D {
  const noop = () => undefined;
  return {
    save: noop,
    restore: noop,
    fill: noop,
    stroke: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    setLineDash: noop,
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'round',
    lineJoin: 'round',
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D;
}

function stroke(): StrokeObject {
  return {
    id: 's',
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    points: [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 10, y: 10, pressure: 0.5, t: 16 },
    ],
  };
}

describe('strokeRenderer streamline wiring', () => {
  beforeEach(() => {
    getStroke.mockClear();
    vi.stubGlobal('Path2D', FakePath2D);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults streamline to 0 when the stroke and options omit it (legacy strokes)', async () => {
    const { drawStroke } = await import('$lib/canvas/strokeRenderer');
    drawStroke(makeCtx(), stroke(), { ptToPx: 1 });
    expect(getStroke).toHaveBeenCalledTimes(1);
    expect(getStroke.mock.calls[0][1]).toMatchObject({ streamline: 0 });
  });

  it('forwards explicit streamline option to perfect-freehand', async () => {
    const { drawStroke } = await import('$lib/canvas/strokeRenderer');
    drawStroke(makeCtx(), stroke(), { ptToPx: 1, streamline: 0.25 });
    expect(getStroke.mock.calls[0][1]).toMatchObject({ streamline: 0.25 });
  });

  it('prefers baked stroke.streamline over opts.streamline', async () => {
    const { drawStroke } = await import('$lib/canvas/strokeRenderer');
    const baked = { ...stroke(), streamline: streamlineFromSmoothing(80) };
    drawStroke(makeCtx(), baked, { ptToPx: 1, streamline: streamlineFromSmoothing(0) });
    expect(getStroke.mock.calls[0][1].streamline).toBeCloseTo(0.792);
  });

  it('live slider does not change a baked stroke across re-renders', async () => {
    const { drawStroke } = await import('$lib/canvas/strokeRenderer');
    const baked = { ...stroke(), streamline: streamlineFromSmoothing(80) };
    for (const live of [0, 50, 100]) {
      getStroke.mockClear();
      drawStroke(makeCtx(), baked, { ptToPx: 1, streamline: streamlineFromSmoothing(live) });
      expect(getStroke.mock.calls[0][1].streamline).toBeCloseTo(0.792);
    }
  });

  it('drawLiveStroke threads streamline through', async () => {
    const { drawLiveStroke } = await import('$lib/canvas/strokeRenderer');
    drawLiveStroke(
      makeCtx(),
      stroke().points,
      stroke().style,
      'pen',
      1,
      streamlineFromSmoothing(100),
    );
    expect(getStroke.mock.calls[0][1]).toMatchObject({ streamline: 0.99 });
  });

  it('slider 0 maps to streamline 0 at the renderer', async () => {
    const { drawLiveStroke } = await import('$lib/canvas/strokeRenderer');
    drawLiveStroke(
      makeCtx(),
      stroke().points,
      stroke().style,
      'pen',
      1,
      streamlineFromSmoothing(0),
    );
    expect(getStroke.mock.calls[0][1]).toMatchObject({ streamline: 0 });
  });

  it('slider 50 maps to streamline 0.495 at the renderer', async () => {
    const { drawLiveStroke } = await import('$lib/canvas/strokeRenderer');
    drawLiveStroke(
      makeCtx(),
      stroke().points,
      stroke().style,
      'pen',
      1,
      streamlineFromSmoothing(50),
    );
    expect(getStroke.mock.calls[0][1].streamline).toBeCloseTo(0.495);
  });
});
