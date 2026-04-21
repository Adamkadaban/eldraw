<script lang="ts">
  import { settings } from '$lib/store/settings';
  import {
    GRAPH_PRESET_LABELS,
    GRAPH_PRESET_ORDER,
    GRAPH_THEME_PRESETS,
    resolveTheme,
    type GraphPresetName,
    type GraphTheme,
    type GraphThemeOverrides,
  } from '$lib/graph/theme';
  import { drawGraphFrame } from '$lib/graph/render';
  import { parseExpression } from '$lib/graph/parser';
  import { plotFunction } from '$lib/graph/plotter';

  const PREVIEW_W = 280;
  const PREVIEW_H = 180;
  const PREVIEW_DEMO_EXPRS: Array<{ expr: string; color: string; width: number }> = [
    { expr: 'sin(x)', color: '#d94d4d', width: 2 },
    { expr: '0.5*x', color: '#2e6fcf', width: 2 },
  ];
  const PREVIEW_COMPILED = PREVIEW_DEMO_EXPRS.map((d) => ({
    ...d,
    parsed: parseExpression(d.expr),
  }));

  let canvas: HTMLCanvasElement | null = $state(null);
  let knobsOpen = $state(false);

  const presetName = $derived<GraphPresetName>($settings.graphTheme);
  const overrides = $derived<GraphThemeOverrides>($settings.graphOverrides ?? {});
  const theme = $derived<GraphTheme>(
    resolveTheme({ graphTheme: presetName, graphOverrides: overrides }),
  );

  function setPreset(name: GraphPresetName): void {
    settings.setGraphTheme(name);
  }

  function resetOverrides(): void {
    settings.resetGraphOverrides();
  }

  function updateOverride(patch: GraphThemeOverrides): void {
    const next: GraphThemeOverrides = deepMerge(overrides, patch);
    settings.setGraphOverrides(next);
  }

  function deepMerge(a: GraphThemeOverrides, b: GraphThemeOverrides): GraphThemeOverrides {
    const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
    for (const k of Object.keys(b)) {
      const incoming = (b as Record<string, unknown>)[k];
      const current = out[k];
      if (
        incoming &&
        typeof incoming === 'object' &&
        !Array.isArray(incoming) &&
        current &&
        typeof current === 'object' &&
        !Array.isArray(current)
      ) {
        out[k] = deepMerge(current as GraphThemeOverrides, incoming as GraphThemeOverrides);
      } else {
        out[k] = incoming;
      }
    }
    return out as GraphThemeOverrides;
  }

  function drawPreview(): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(PREVIEW_W * dpr);
    canvas.height = Math.round(PREVIEW_H * dpr);
    canvas.style.width = `${PREVIEW_W}px`;
    canvas.style.height = `${PREVIEW_H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);

    const rect = { x: 0, y: 0, w: PREVIEW_W, h: PREVIEW_H };
    const xRange: [number, number] = [-6, 6];
    const yRange: [number, number] = [-3.5, 3.5];

    drawGraphFrame(ctx, {
      rect,
      xRange,
      yRange,
      theme,
      gridStep: 0,
      showAxes: true,
      showGrid: true,
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const xToPx = (x: number) => ((x - xRange[0]) / (xRange[1] - xRange[0])) * rect.w;
    const yToPx = (y: number) => (1 - (y - yRange[0]) / (yRange[1] - yRange[0])) * rect.h;

    for (const demo of PREVIEW_COMPILED) {
      if (!demo.parsed.ok) continue;
      ctx.strokeStyle = demo.color;
      ctx.lineWidth = Math.max(theme.curveDefaultWidth, demo.width);
      const segments = plotFunction(demo.parsed.fn, { xRange, yRange, samples: 400 });
      for (const seg of segments) {
        if (seg.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(xToPx(seg[0].x), yToPx(seg[0].y));
        for (let i = 1; i < seg.length; i += 1) {
          ctx.lineTo(xToPx(seg[i].x), yToPx(seg[i].y));
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  $effect(() => {
    void theme;
    void presetName;
    drawPreview();
  });

  function onColor(key: 'axisColor' | 'labelColor' | 'background', value: string): void {
    updateOverride({ [key]: value });
  }

  function onNumber(path: string[], value: number): void {
    if (!Number.isFinite(value)) return;
    const patch: Record<string, unknown> = {};
    let cursor = patch;
    for (let i = 0; i < path.length - 1; i += 1) {
      const next: Record<string, unknown> = {};
      cursor[path[i]] = next;
      cursor = next;
    }
    cursor[path[path.length - 1]] = value;
    updateOverride(patch as GraphThemeOverrides);
  }

  function onToggle(path: string[], value: boolean): void {
    const patch: Record<string, unknown> = {};
    let cursor = patch;
    for (let i = 0; i < path.length - 1; i += 1) {
      const next: Record<string, unknown> = {};
      cursor[path[i]] = next;
      cursor = next;
    }
    cursor[path[path.length - 1]] = value;
    updateOverride(patch as GraphThemeOverrides);
  }

  function onOrigin(value: 'none' | 'letter' | 'coords'): void {
    updateOverride({ originLabel: value });
  }
</script>

<section class="graph-style" aria-label="Graph style">
  <h3>Graph style</h3>

  <div class="presets" role="radiogroup" aria-label="Graph preset">
    {#each GRAPH_PRESET_ORDER as name (name)}
      <button
        type="button"
        role="radio"
        aria-checked={presetName === name}
        class="preset"
        class:active={presetName === name}
        onclick={() => setPreset(name)}
      >
        <span
          class="swatch"
          aria-hidden="true"
          style="background: {GRAPH_THEME_PRESETS[name]
            .background}; border-color: {GRAPH_THEME_PRESETS[name]
            .frameColor}; color: {GRAPH_THEME_PRESETS[name].axisColor};"
        >
          {#each [0.25, 0.5, 0.75] as y (y)}
            <span
              class="swatch-line"
              style="top: {y * 100}%; background: {GRAPH_THEME_PRESETS[name].gridMajor
                .color}; opacity: {GRAPH_THEME_PRESETS[name].gridMajor.enabled
                ? GRAPH_THEME_PRESETS[name].gridMajor.opacity
                : 0};"
            ></span>
          {/each}
        </span>
        <span class="preset-label">{GRAPH_PRESET_LABELS[name]}</span>
      </button>
    {/each}
  </div>

  <div class="preview-wrap">
    <canvas bind:this={canvas} aria-label="Graph style preview" data-testid="graph-preview"
    ></canvas>
  </div>

  <button
    type="button"
    class="knobs-toggle"
    aria-expanded={knobsOpen}
    onclick={() => (knobsOpen = !knobsOpen)}
  >
    {knobsOpen ? '▾' : '▸'} Tuning
  </button>

  {#if knobsOpen}
    <div class="knobs">
      <label>
        <span>Axis color</span>
        <input
          type="color"
          value={theme.axisColor}
          oninput={(e) => onColor('axisColor', (e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label>
        <span>Axis width</span>
        <input
          type="range"
          min="0.5"
          max="3"
          step="0.25"
          value={theme.axisWidth}
          oninput={(e) =>
            onNumber(['axisWidth'], Number((e.currentTarget as HTMLInputElement).value))}
        />
        <output>{theme.axisWidth.toFixed(2)}</output>
      </label>
      <label class="checkbox">
        <input
          type="checkbox"
          checked={theme.axisArrowheads}
          onchange={(e) =>
            onToggle(['axisArrowheads'], (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>Axis arrowheads</span>
      </label>

      <label>
        <span>Major grid color</span>
        <input
          type="color"
          value={theme.gridMajor.color}
          oninput={(e) =>
            updateOverride({
              gridMajor: { color: (e.currentTarget as HTMLInputElement).value },
            })}
        />
      </label>
      <label>
        <span>Major grid opacity</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={theme.gridMajor.opacity}
          oninput={(e) =>
            onNumber(['gridMajor', 'opacity'], Number((e.currentTarget as HTMLInputElement).value))}
        />
        <output>{theme.gridMajor.opacity.toFixed(2)}</output>
      </label>
      <label class="checkbox">
        <input
          type="checkbox"
          checked={theme.gridMinor.enabled}
          onchange={(e) =>
            onToggle(['gridMinor', 'enabled'], (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>Minor grid</span>
      </label>
      <label>
        <span>Minor subdivisions</span>
        <input
          type="number"
          min="2"
          max="10"
          step="1"
          value={theme.gridMinor.subdivisions}
          oninput={(e) =>
            onNumber(
              ['gridMinor', 'subdivisions'],
              Number((e.currentTarget as HTMLInputElement).value),
            )}
        />
      </label>

      <label>
        <span>Background</span>
        <input
          type="color"
          value={theme.background}
          oninput={(e) => onColor('background', (e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="checkbox">
        <input
          type="checkbox"
          checked={theme.backgroundEnabled}
          onchange={(e) =>
            onToggle(['backgroundEnabled'], (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>Fill background</span>
      </label>

      <label>
        <span>Label color</span>
        <input
          type="color"
          value={theme.labelColor}
          oninput={(e) => onColor('labelColor', (e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label>
        <span>Label size</span>
        <input
          type="number"
          min="7"
          max="20"
          step="1"
          value={theme.labelFontSize}
          oninput={(e) =>
            onNumber(['labelFontSize'], Number((e.currentTarget as HTMLInputElement).value))}
        />
      </label>

      <label>
        <span>Origin label</span>
        <select
          value={theme.originLabel}
          onchange={(e) =>
            onOrigin((e.currentTarget as HTMLSelectElement).value as 'none' | 'letter' | 'coords')}
        >
          <option value="none">None</option>
          <option value="letter">O</option>
          <option value="coords">(0, 0)</option>
        </select>
      </label>

      <label>
        <span>Default curve width</span>
        <input
          type="range"
          min="1"
          max="4"
          step="0.25"
          value={theme.curveDefaultWidth}
          oninput={(e) =>
            onNumber(['curveDefaultWidth'], Number((e.currentTarget as HTMLInputElement).value))}
        />
        <output>{theme.curveDefaultWidth.toFixed(2)}</output>
      </label>

      <div class="knobs-actions">
        <button type="button" class="reset" onclick={resetOverrides}>
          Reset to {GRAPH_PRESET_LABELS[presetName]}
        </button>
      </div>
    </div>
  {/if}
</section>

<style>
  .graph-style {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
  }
  .preset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 6px;
    cursor: pointer;
    color: #ddd;
    font-size: 12px;
    text-align: left;
  }
  .preset.active {
    border-color: #7ab7ff;
    background: #253246;
  }
  .swatch {
    position: relative;
    height: 40px;
    border-radius: 4px;
    border: 1px solid;
    overflow: hidden;
  }
  .swatch-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
  }
  .preset-label {
    font-size: 12px;
  }
  .preview-wrap {
    display: flex;
    justify-content: center;
    padding: 6px;
    background: #111;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
  }
  .knobs-toggle {
    align-self: flex-start;
    background: transparent;
    border: none;
    color: #ddd;
    font: inherit;
    cursor: pointer;
    padding: 2px 4px;
  }
  .knobs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 14px;
    padding: 8px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
  }
  .knobs label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #ccc;
  }
  .knobs label.checkbox {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .knobs input[type='color'] {
    width: 100%;
    height: 24px;
    padding: 0;
    border: 1px solid #333;
    background: #111;
  }
  .knobs input[type='number'],
  .knobs select {
    background: #111;
    color: #ddd;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 3px 6px;
    font: inherit;
  }
  .knobs output {
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: #999;
  }
  .knobs-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
  }
  .reset {
    background: #2a2a2a;
    color: #ddd;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 10px;
    font: inherit;
    cursor: pointer;
  }
  .reset:hover {
    border-color: #666;
  }
</style>
