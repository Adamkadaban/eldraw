import { describe, it, expect } from 'vitest';
import { computeSteps, drawGraphFrame, snapLine } from '$lib/graph/render';
import { GRAPH_THEME_PRESETS, resolveTheme } from '$lib/graph/theme';

describe('snapLine', () => {
  it('adds a 0.5 offset for 1-px strokes', () => {
    expect(snapLine(10.3, 1)).toBe(10.5);
    expect(snapLine(10.8, 1)).toBe(11.5);
    expect(snapLine(10, 1)).toBe(10.5);
  });

  it('rounds to integer for 2-px strokes', () => {
    expect(snapLine(10.3, 2)).toBe(10);
    expect(snapLine(10.8, 2)).toBe(11);
  });
});

describe('computeSteps', () => {
  it('returns 1/2/5 × 10^n steps for standard ranges', () => {
    const theme = resolveTheme({ graphTheme: 'classic' });
    const s = computeSteps([-10, 10], [-10, 10], theme, 0);
    for (const step of [s.majorXStep, s.majorYStep]) {
      const exp = Math.floor(Math.log10(step));
      const m = Math.round(step / 10 ** exp);
      expect([1, 2, 5]).toContain(m);
    }
  });

  it('respects the minor subdivision count from the theme', () => {
    const theme = resolveTheme({
      graphTheme: 'classic',
      graphOverrides: { gridMinor: { subdivisions: 4 } },
    });
    const s = computeSteps([-10, 10], [-10, 10], theme, 0);
    expect(s.minorXStep * 4).toBeCloseTo(s.majorXStep);
  });

  it('disables minor grid drawing when the theme turns it off', () => {
    const theme = resolveTheme({ graphTheme: 'minimal' });
    const s = computeSteps([-10, 10], [-10, 10], theme, 0);
    expect(s.drawMinorX).toBe(false);
    expect(s.drawMinorY).toBe(false);
  });

  it('uses the user gridStep when provided', () => {
    const theme = resolveTheme({ graphTheme: 'classic' });
    const s = computeSteps([0, 10], [0, 10], theme, 2);
    expect(s.majorXStep).toBe(2);
    expect(s.majorYStep).toBe(2);
  });
});

interface FakeCtxRec {
  type: string;
  [k: string]: unknown;
}

function createFakeCtx(): {
  ctx: CanvasRenderingContext2D;
  calls: FakeCtxRec[];
  texts: Array<{ text: string; x: number; y: number; align: string; baseline: string }>;
} {
  const calls: FakeCtxRec[] = [];
  const texts: Array<{ text: string; x: number; y: number; align: string; baseline: string }> = [];
  const state: Record<string, unknown> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    font: '10px sans',
    globalAlpha: 1,
  };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'save' || prop === 'restore') {
        return () => calls.push({ type: prop });
      }
      if (prop === 'beginPath' || prop === 'closePath' || prop === 'stroke' || prop === 'fill') {
        return () => calls.push({ type: prop });
      }
      if (prop === 'moveTo' || prop === 'lineTo') {
        return (x: number, y: number) => calls.push({ type: prop as string, x, y });
      }
      if (prop === 'rect' || prop === 'fillRect' || prop === 'strokeRect') {
        return (x: number, y: number, w: number, h: number) =>
          calls.push({ type: prop as string, x, y, w, h });
      }
      if (prop === 'clip') return () => calls.push({ type: 'clip' });
      if (prop === 'setLineDash') return () => undefined;
      if (prop === 'fillText') {
        return (text: string, x: number, y: number) => {
          texts.push({
            text,
            x,
            y,
            align: String(target.textAlign),
            baseline: String(target.textBaseline),
          });
        };
      }
      return target[prop];
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, texts };
}

describe('drawGraphFrame zero suppression', () => {
  it('does not emit a tick label for 0 when both axes meet inside the frame', () => {
    const theme = resolveTheme({ graphTheme: 'classic' });
    const { ctx, texts } = createFakeCtx();
    drawGraphFrame(ctx, {
      rect: { x: 0, y: 0, w: 200, h: 200 },
      xRange: [-5, 5],
      yRange: [-5, 5],
      theme,
      gridStep: 1,
      showAxes: true,
      showGrid: true,
    });
    const tickLabels = texts.filter((t) => t.text !== 'x' && t.text !== 'y');
    // Tick labels only: should not include '0'.
    expect(tickLabels.some((t) => t.text === '0')).toBe(false);
    expect(tickLabels.some((t) => t.text === '3')).toBe(true);
  });

  it('labels non-zero ticks when only the x-axis is visible', () => {
    const theme = resolveTheme({ graphTheme: 'classic' });
    const { ctx, texts } = createFakeCtx();
    drawGraphFrame(ctx, {
      rect: { x: 0, y: 0, w: 200, h: 200 },
      xRange: [2, 8],
      yRange: [-5, 5],
      theme,
      gridStep: 1,
      showAxes: true,
      showGrid: true,
    });
    // y-axis not in xRange; x-axis at y=0 is visible. Tick labels on x show 3..7.
    expect(texts.some((t) => t.text === '3')).toBe(true);
    expect(texts.some((t) => t.text === '7')).toBe(true);
  });

  it('shows an origin label when the theme requests one', () => {
    const theme = resolveTheme({
      graphTheme: 'classic',
      graphOverrides: { originLabel: 'coords' },
    });
    const { ctx, texts } = createFakeCtx();
    drawGraphFrame(ctx, {
      rect: { x: 0, y: 0, w: 200, h: 200 },
      xRange: [-5, 5],
      yRange: [-5, 5],
      theme,
      gridStep: 1,
      showAxes: true,
      showGrid: true,
    });
    expect(texts.some((t) => t.text === '(0, 0)')).toBe(true);
  });

  it('renders italic axis labels x and y when enabled', () => {
    const theme = resolveTheme({ graphTheme: 'textbook' });
    const { ctx, texts } = createFakeCtx();
    drawGraphFrame(ctx, {
      rect: { x: 0, y: 0, w: 200, h: 200 },
      xRange: [-5, 5],
      yRange: [-5, 5],
      theme,
      gridStep: 1,
      showAxes: true,
      showGrid: true,
    });
    expect(texts.some((t) => t.text === 'x')).toBe(true);
    expect(texts.some((t) => t.text === 'y')).toBe(true);
  });
});

describe('theme changes affect drawn output', () => {
  it('switching a theme changes the stroke colors painted', () => {
    const lightTheme = GRAPH_THEME_PRESETS.classic;
    const darkTheme = GRAPH_THEME_PRESETS.blueprint;
    const a = createFakeCtx();
    const b = createFakeCtx();
    for (const [ctx, theme] of [
      [a.ctx, lightTheme],
      [b.ctx, darkTheme],
    ] as const) {
      drawGraphFrame(ctx, {
        rect: { x: 0, y: 0, w: 200, h: 200 },
        xRange: [-5, 5],
        yRange: [-5, 5],
        theme,
        gridStep: 1,
        showAxes: true,
        showGrid: true,
      });
    }
    // The fake ctx proxy records final mutations on its state, so we can inspect
    // strokeStyle / fillStyle by reading the last value set during the call.
    const aState = a.ctx as unknown as Record<string, unknown>;
    const bState = b.ctx as unknown as Record<string, unknown>;
    expect(aState.strokeStyle).not.toBe(bState.strokeStyle);
  });
});
