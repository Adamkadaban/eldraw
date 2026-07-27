<script lang="ts">
  import { isSafeHexColor } from '$lib/color';
  import GraphLayer from '$lib/canvas/GraphLayer.svelte';
  import { renderLatex } from '$lib/text/latex';
  import type { Slide, SlideBlock, SlideListItem, SlideTheme } from '$lib/types';
  import { layoutSlide, type LayoutBox } from '../layout';
  import { resolveTheme } from '../theme';
  import { graphObjectForSlide, graphThemeForSlide } from './graphAdapter';
  import { renderInlineMath } from './inlineMath';
  import { mappingGeometry } from './mappingGeometry';

  interface Props {
    slide: Slide;
    theme: SlideTheme;
    width: number;
    height: number;
    ptToPx: number;
  }

  let { slide, theme: themeInput, width, height, ptToPx }: Props = $props();

  const scale = $derived(Number.isFinite(ptToPx) && ptToPx > 0 ? ptToPx : 1);
  const theme = $derived(resolveTheme(themeInput, slide.theme));
  const layout = $derived(layoutSlide(slide, theme, width / scale, height / scale));

  function boxStyle(box: LayoutBox): string {
    return `left:${box.x * scale}px;top:${box.y * scale}px;width:${box.w * scale}px;height:${box.h * scale}px`;
  }

  function textColor(color: string | undefined): string {
    return isSafeHexColor(color) ? color : theme.textColor;
  }

  function fontSize(size: number | undefined): number {
    return Number.isFinite(size) && (size ?? 0) > 0 ? (size as number) : theme.bodySize;
  }

  function level(item: SlideListItem): number {
    return Number.isFinite(item.level) ? Math.min(3, Math.max(0, Math.floor(item.level))) : 0;
  }

  function listMarker(
    items: SlideListItem[],
    index: number,
    marker: 'bullet' | 'decimal' | 'none',
  ): string {
    if (marker === 'none') return '';
    if (level(items[index]) > 0) return '•';
    if (marker === 'bullet') return '•';
    let number = 0;
    for (let itemIndex = 0; itemIndex <= index; itemIndex += 1) {
      if (level(items[itemIndex]) === 0) number += 1;
    }
    return `${number}.`;
  }

  function tableColumnCount(block: Extract<SlideBlock, { kind: 'table' }>): number {
    return Math.max(1, block.header.length, ...block.rows.map((row) => row.length));
  }

  function tableWeights(block: Extract<SlideBlock, { kind: 'table' }>): number[] {
    const count = tableColumnCount(block);
    if (
      block.columnWeights?.length === count &&
      block.columnWeights.every((weight) => Number.isFinite(weight) && weight > 0)
    ) {
      return block.columnWeights;
    }
    return Array.from({ length: count }, () => 1);
  }

  function paddedRow(row: string[], count: number): string[] {
    return Array.from({ length: count }, (_, index) => row[index] ?? '');
  }

  function calloutBackground(tone: Extract<SlideBlock, { kind: 'callout' }>['tone']): string {
    if (tone === 'tip') return '#e8f3ea';
    if (tone === 'warn') return '#fff1d6';
    return '#e8f0f7';
  }

  function safeImageSource(src: string): string | undefined {
    return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src) ? src : undefined;
  }

  function mathHtml(source: string, display: boolean): string {
    return renderLatex(source, { displayMode: display }).html;
  }
</script>

<div
  class="slide-layer"
  class:title-layout={slide.layout === 'title'}
  style:width={`${width}px`}
  style:height={`${height}px`}
  style:background={theme.background}
  style:color={theme.textColor}
  style:font-family={theme.fontFamily}
>
  {#if slide.layout === 'title'}
    <div class="hero-tint" style:background={theme.accent}></div>
  {/if}

  {#if layout.title}
    <div
      class="slide-title"
      style={boxStyle(layout.title.box)}
      style:color={theme.titleColor}
      style:font-size={`${layout.title.fontSize * scale}px`}
      style:text-align={layout.title.align}
    >
      <!-- Only escaped text and KaTeX output reach this trust boundary. -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html renderInlineMath(layout.title.text)}
    </div>
  {/if}

  {#if layout.subtitle}
    <div
      class="slide-subtitle"
      style={boxStyle(layout.subtitle.box)}
      style:font-size={`${layout.subtitle.fontSize * scale}px`}
    >
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html renderInlineMath(layout.subtitle.text)}
    </div>
  {/if}

  {#each [...layout.blocks, ...layout.asides] as placed (placed.block.id)}
    <div class="slide-block block-{placed.block.kind}" style={boxStyle(placed.box)}>
      {#if placed.block.kind === 'text'}
        <div
          class:bold={placed.block.bold}
          class:italic={placed.block.italic}
          style:color={textColor(placed.block.color)}
          style:font-size={`${fontSize(placed.block.fontSize) * scale}px`}
          style:text-align={placed.block.align ?? 'left'}
        >
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html renderInlineMath(placed.block.text)}
        </div>
      {:else if placed.block.kind === 'list'}
        <div class="list" style:font-size={`${fontSize(placed.block.fontSize) * scale}px`}>
          {#each placed.block.items as item, index}
            <div
              class="list-item"
              style:padding-left={`${level(item) * fontSize(placed.block.fontSize) * 1.4 * scale}px`}
            >
              <span class="marker"
                >{listMarker(placed.block.items, index, placed.block.marker)}</span
              >
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              <span>{@html renderInlineMath(item.text)}</span>
            </div>
          {/each}
        </div>
      {:else if placed.block.kind === 'definitions'}
        <div class="definitions" style:font-size={`${fontSize(placed.block.fontSize) * scale}px`}>
          {#each placed.block.items as item}
            <div class="definition">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              <strong>{@html renderInlineMath(item.term)}</strong>
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              <span>: {@html renderInlineMath(item.text)}</span>
            </div>
          {/each}
        </div>
      {:else if placed.block.kind === 'table'}
        {@const columnCount = tableColumnCount(placed.block)}
        {@const weights = tableWeights(placed.block)}
        <div class="table-wrap" style:font-size={`${fontSize(placed.block.fontSize) * scale}px`}>
          {#if placed.block.caption}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            <div class="caption">{@html renderInlineMath(placed.block.caption)}</div>
          {/if}
          <div
            class="table"
            style:grid-template-columns={weights.map((weight) => `${weight}fr`).join(' ')}
          >
            {#if placed.block.header.length > 0}
              {#each paddedRow(placed.block.header, columnCount) as cell}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                <div class="cell header-cell">{@html renderInlineMath(cell)}</div>
              {/each}
            {/if}
            {#each placed.block.rows as row}
              {#each paddedRow(row, columnCount) as cell}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                <div class="cell">{@html renderInlineMath(cell)}</div>
              {/each}
            {/each}
          </div>
        </div>
      {:else if placed.block.kind === 'math'}
        <div
          class="math"
          style:color={textColor(placed.block.color)}
          style:font-size={`${fontSize(placed.block.fontSize) * scale}px`}
          style:text-align={placed.block.align ?? 'center'}
        >
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html mathHtml(placed.block.latex, placed.block.display)}
        </div>
      {:else if placed.block.kind === 'graph'}
        {@const captionSize = placed.block.caption ? theme.bodySize * 1.8 : 0}
        {@const graphHeight = Math.max(0, placed.box.h - captionSize)}
        {#if placed.block.caption}
          <div class="caption" style:font-size={`${theme.bodySize * scale}px`}>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html renderInlineMath(placed.block.caption)}
          </div>
        {/if}
        <div
          class="graph"
          style:height={`${graphHeight * scale}px`}
          style:margin-top={placed.block.caption ? `${theme.bodySize * 0.45 * scale}px` : '0'}
        >
          <GraphLayer
            graphs={[
              graphObjectForSlide(
                placed.block.graph,
                { x: 0, y: 0, w: placed.box.w, h: graphHeight },
                theme,
              ),
            ]}
            width={placed.box.w * scale}
            height={graphHeight * scale}
            ptToPx={scale}
            theme={graphThemeForSlide(theme, scale)}
          />
        </div>
      {:else if placed.block.kind === 'mapping'}
        {@const mapping = mappingGeometry(placed.block, placed.box.w, placed.box.h, theme.bodySize)}
        <div class="mapping">
          <svg
            class="mapping-svg"
            viewBox={`0 0 ${placed.box.w} ${placed.box.h}`}
            aria-hidden="true"
          >
            <ellipse
              cx={mapping.leftOval.cx}
              cy={mapping.leftOval.cy}
              rx={mapping.leftOval.rx}
              ry={mapping.leftOval.ry}
              fill={theme.accent}
              fill-opacity="0.1"
              stroke={theme.accent}
              stroke-opacity="0.45"
              stroke-width="1.1"
            />
            <ellipse
              cx={mapping.rightOval.cx}
              cy={mapping.rightOval.cy}
              rx={mapping.rightOval.rx}
              ry={mapping.rightOval.ry}
              fill={theme.textColor}
              fill-opacity="0.045"
              stroke={theme.textColor}
              stroke-opacity="0.28"
              stroke-width="1.1"
            />
            {#each mapping.arrows as arrow}
              <line
                x1={arrow.from.x}
                y1={arrow.from.y}
                x2={arrow.to.x}
                y2={arrow.to.y}
                stroke={theme.textColor}
                stroke-opacity="0.65"
                stroke-width="1.15"
              />
              <polygon
                points={arrow.head.map((point) => `${point.x},${point.y}`).join(' ')}
                fill={theme.textColor}
                fill-opacity="0.7"
              />
            {/each}
          </svg>
          {#if mapping.caption && placed.block.caption}
            <div
              class="mapping-caption"
              style:left={`${mapping.caption.x * scale}px`}
              style:top={`${mapping.caption.y * scale}px`}
              style:font-size={`${theme.bodySize * scale}px`}
            >
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html renderInlineMath(placed.block.caption)}
            </div>
          {/if}
          {#each mapping.leftItems as item}
            <div
              class="mapping-item"
              style:left={`${item.x * scale}px`}
              style:top={`${item.y * scale}px`}
              style:width={`${mapping.leftOval.rx * 1.35 * scale}px`}
              style:font-size={`${theme.bodySize * scale}px`}
            >
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html renderInlineMath(item.text)}
            </div>
          {/each}
          {#each mapping.rightItems as item}
            <div
              class="mapping-item"
              style:left={`${item.x * scale}px`}
              style:top={`${item.y * scale}px`}
              style:width={`${mapping.rightOval.rx * 1.35 * scale}px`}
              style:font-size={`${theme.bodySize * scale}px`}
            >
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html renderInlineMath(item.text)}
            </div>
          {/each}
          <div
            class="mapping-label"
            style:left={`${mapping.leftLabel.x * scale}px`}
            style:top={`${mapping.leftLabel.y * scale}px`}
            style:font-size={`${theme.bodySize * 0.86 * scale}px`}
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html renderInlineMath(placed.block.leftLabel)}
          </div>
          <div
            class="mapping-label"
            style:left={`${mapping.rightLabel.x * scale}px`}
            style:top={`${mapping.rightLabel.y * scale}px`}
            style:font-size={`${theme.bodySize * 0.86 * scale}px`}
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html renderInlineMath(placed.block.rightLabel)}
          </div>
        </div>
      {:else if placed.block.kind === 'callout'}
        <div
          class="callout"
          style:background={calloutBackground(placed.block.tone)}
          style:border-color={theme.accent}
          style:font-size={`${fontSize(placed.block.fontSize) * scale}px`}
        >
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html renderInlineMath(placed.block.text)}
        </div>
      {:else if placed.block.kind === 'image'}
        {@const src = safeImageSource(placed.block.src)}
        <div class="image-wrap align-{placed.block.align ?? 'center'}">
          {#if src}
            <img {src} alt={placed.block.alt} />
          {:else}
            <span class="image-fallback">{placed.block.alt}</span>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .slide-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    line-height: 1.35;
  }

  .hero-tint {
    position: absolute;
    inset: 0 0 42% 0;
    opacity: 0.07;
  }

  .slide-title,
  .slide-subtitle,
  .slide-block {
    position: absolute;
    box-sizing: border-box;
    overflow: hidden;
  }

  .slide-title {
    font-weight: 700;
    line-height: 1.16;
  }

  .slide-subtitle {
    text-align: center;
    opacity: 0.8;
  }

  .bold {
    font-weight: 700;
  }

  .italic {
    font-style: italic;
  }

  .list-item {
    display: flex;
    align-items: baseline;
    min-width: 0;
  }

  .marker {
    flex: 0 0 1.45em;
    text-align: right;
    margin-right: 0.55em;
  }

  .definition + .definition {
    margin-top: 0.35em;
  }

  .table {
    display: grid;
    border-top: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-left: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  }

  .cell {
    min-width: 0;
    padding: 0.55em;
    border-right: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-bottom: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    overflow-wrap: anywhere;
  }

  .header-cell {
    background: color-mix(in srgb, currentColor 7%, transparent);
    font-weight: 650;
  }

  .caption {
    margin-bottom: 0.45em;
    font-weight: 600;
  }

  .math {
    width: 100%;
  }

  .graph {
    position: relative;
    width: 100%;
    overflow: hidden;
  }

  .mapping,
  .mapping-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .mapping-item,
  .mapping-label,
  .mapping-caption {
    position: absolute;
    transform: translate(-50%, -50%);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mapping-label,
  .mapping-caption {
    font-weight: 600;
  }

  .callout {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 0.8em;
    border-left: 0.28em solid;
    border-radius: 0.55em;
  }

  .image-wrap {
    display: flex;
    width: 100%;
    height: 100%;
  }

  .align-left {
    justify-content: flex-start;
  }

  .align-center {
    justify-content: center;
  }

  .align-right {
    justify-content: flex-end;
  }

  img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .image-fallback {
    align-self: center;
    opacity: 0.5;
  }
</style>
