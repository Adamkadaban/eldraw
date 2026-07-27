import type { TextMathMode } from '$lib/types';
import { detectMathSegments } from './autodetect';
import { escapeHtml, renderLatex, type KatexRenderFn } from './latex';
import { normalizeMathSource } from './normalize';
import { segmentLatex, type TextSegment } from './segment';

export type RenderedRun =
  | { kind: 'text'; value: string }
  | {
      kind: 'math';
      source: string;
      html: string;
      display: boolean;
      errored: boolean;
      error?: string;
    };

export interface MixedRender {
  runs: RenderedRun[];
  errored: boolean;
}

function renderMath(
  source: string,
  display: boolean,
  render: KatexRenderFn | undefined,
  normalized = source,
): RenderedRun {
  const result = renderLatex(normalized, { displayMode: display }, render);
  if (result.ok) {
    return { kind: 'math', source, html: result.html, display, errored: false };
  }
  return {
    kind: 'math',
    source,
    html: escapeHtml(source),
    display,
    errored: true,
    error: result.error,
  };
}

function appendRun(runs: RenderedRun[], run: RenderedRun): void {
  if (run.kind === 'text' && run.value.length === 0) return;
  const previous = runs[runs.length - 1];
  if (previous?.kind === 'text' && run.kind === 'text') {
    previous.value += run.value;
    return;
  }
  runs.push(run);
}

function renderSegments(
  segments: TextSegment[],
  render: KatexRenderFn | undefined,
  normalize: boolean,
): RenderedRun[] {
  const runs: RenderedRun[] = [];
  for (const segment of segments) {
    if (segment.kind === 'text') {
      appendRun(runs, { kind: 'text', value: segment.value });
    } else {
      appendRun(
        runs,
        renderMath(
          segment.value,
          segment.display,
          render,
          normalize ? normalizeMathSource(segment.value) : segment.value,
        ),
      );
    }
  }
  return runs;
}

function renderAuto(source: string, render: KatexRenderFn | undefined): RenderedRun[] {
  const runs: RenderedRun[] = [];
  for (const segment of segmentLatex(source)) {
    const rendered =
      segment.kind === 'math'
        ? renderSegments([segment], render, false)
        : renderSegments(detectMathSegments(segment.value), render, true);
    for (const run of rendered) appendRun(runs, run);
  }
  return runs;
}

export function renderMixed(
  source: string,
  mode: TextMathMode,
  render?: KatexRenderFn,
): MixedRender {
  let runs: RenderedRun[];
  switch (mode) {
    case 'plain':
      runs = [{ kind: 'text', value: source }];
      break;
    case 'latex':
      runs = [renderMath(source, false, render)];
      break;
    case 'mixed':
      runs = renderSegments(segmentLatex(source), render, false);
      break;
    case 'auto':
      runs = renderAuto(source, render);
      break;
  }
  return { runs, errored: runs.some((run) => run.kind === 'math' && run.errored) };
}
