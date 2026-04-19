# eldraw — Plan

A cross-platform (Windows + Linux) PDF annotation tool focused on live math
teaching. Inspired by Drawboard / Xournal++, but with first-class support for
graphs, equations, and teaching ergonomics.

## Goals

- Annotate exported PDFs (from Google Slides / PowerPoint) with a stylus
- Low-latency inking suitable for live classroom use
- First-class math tools: function plotter, number line, shapes, LaTeX text
- Non-destructive: source PDF is never mutated; annotations live in a sidecar
- Flatten-export to a standard PDF for sharing with students

## Stack

- **Shell**: Tauri 2 (Rust)
- **Frontend**: Svelte + TypeScript + Vite
- **PDF rendering**: `pdfium-render` (Rust) → PNG bytes → canvas
- **Ink**: `perfect-freehand` driven by Pointer Events API (pressure)
- **Graphs**: `mathjs` parser + custom adaptive canvas plotter
- **Equations (phase 2)**: KaTeX
- **Storage**: sidecar `.eldraw.json` (vector); flatten-export to PDF
- **Distribution**: Windows MSI + Linux AppImage + Linux deb

## Architecture

```
┌─────────────────────────────────────────────┐
│ Frontend (Svelte)                           │
│  ┌────────────┐  ┌──────────────────────┐   │
│  │ Sidebar    │  │ Canvas Stack         │   │
│  │ - tools    │  │  [PDF bitmap layer]  │   │
│  │ - colors   │  │  [Highlighter layer] │   │
│  │ - widths   │  │  [Object layer]      │   │
│  │ - pages    │  │  [Ink layer]         │   │
│  │            │  │  [Live/preview]      │   │
│  └────────────┘  └──────────────────────┘   │
└──────────────────────┬──────────────────────┘
                       │ Tauri IPC
┌──────────────────────┴──────────────────────┐
│ Rust backend                                │
│  - pdfium: render page → PNG bytes          │
│  - file I/O: load PDF, load/save sidecar    │
│  - export: flatten strokes into new PDF     │
└─────────────────────────────────────────────┘
```

Layered canvases (bottom → top):

1. **PDF bitmap** — rerendered only on zoom / page change
2. **Highlighter** — multiply blend, ~30% alpha
3. **Objects** — graphs, shapes, text, number lines (vector)
4. **Ink** — committed pen strokes
5. **Live** — in-progress stroke, laser pointer

Only the live layer repaints per pointer event. This is the primary latency
lever.

## Repo Layout

```
eldraw/
├── src-tauri/                  Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── pdf.rs              pdfium render commands
│   │   ├── export.rs           flatten strokes → PDF
│   │   └── storage.rs          sidecar JSON load/save, autosave
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                        Svelte frontend
│   ├── lib/
│   │   ├── canvas/
│   │   │   ├── PdfLayer.svelte
│   │   │   ├── HighlightLayer.svelte
│   │   │   ├── InkLayer.svelte
│   │   │   ├── ObjectLayer.svelte
│   │   │   └── LiveLayer.svelte
│   │   ├── tools/
│   │   │   ├── pen.ts
│   │   │   ├── highlighter.ts
│   │   │   ├── eraser.ts
│   │   │   ├── line.ts
│   │   │   └── graph.ts
│   │   ├── graph/
│   │   │   ├── plotter.ts      adaptive sampling
│   │   │   └── parser.ts       mathjs wrapper
│   │   ├── sidebar/
│   │   │   ├── Sidebar.svelte
│   │   │   ├── ColorPalette.svelte
│   │   │   └── WidthPicker.svelte
│   │   ├── store/
│   │   │   ├── document.ts     pages, objects, selection
│   │   │   ├── tool.ts         active tool state
│   │   │   └── history.ts      undo/redo stacks
│   │   └── types.ts
│   ├── App.svelte
│   └── main.ts
├── package.json
└── README.md
```

## Data Model (sidecar JSON)

```jsonc
{
  "version": 1,
  "pdfHash": "sha256…",
  "pages": [
    {
      "pageIndex": 0,
      "type": "pdf",
      "insertedAfterPdfPage": null,
      "objects": [
        { "id": "u1", "type": "stroke", "tool": "pen",
          "color": "#e11", "width": 3, "dash": null,
          "points": [[x, y, pressure, t]] },
        { "id": "u2", "type": "highlight", "...": "..." },
        { "id": "u3", "type": "graph",
          "bounds": [x, y, w, h],
          "xRange": [-10, 10], "yRange": [-10, 10],
          "gridStep": 1, "showAxes": true,
          "functions": [
            { "expr": "x^2 - 3", "color": "#07c", "width": 2,
              "dash": null, "domain": [-5, 5] }
          ] },
        { "id": "u4", "type": "line", "straight": true },
        { "id": "u5", "type": "text", "latex": false, "content": "…" }
      ]
    }
  ],
  "palettes": [],
  "prefs": { "sidebarPinned": true, "defaultWidths": {} }
}
```

All coordinates are in **PDF user-space points** so zoom/resolution changes are
lossless.

## Keyboard Shortcuts

| Key                   | Action                                      |
| --------------------- | ------------------------------------------- |
| P / H / E             | Pen / Highlighter / Eraser                  |
| L                     | Straight line                               |
| G                     | Graph tool                                  |
| 1–9                   | Palette color slots                         |
| [ / ]                 | Decrease / increase width                   |
| D                     | Toggle dash cycle (solid → dashed → dotted) |
| ← / → / PgUp / PgDn   | Prev / next page                            |
| B                     | Insert blank page after current             |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo                                 |
| F                     | Fullscreen / presentation mode              |
| Space (hold)          | Pan                                         |
| Tab                   | Toggle sidebar                              |

## Phased Roadmap

### Phase 1 — MVP (usable in the classroom)

1. Tauri + Svelte scaffold, verified on Linux
2. `pdfium-render` page rendering, zoom/pan, page nav
3. Five-layer canvas stack
4. Pen, highlighter, stroke eraser via perfect-freehand + Pointer Events
5. Straight-line tool, solid/dashed/dotted dash styles
6. Color palette (presets + picker + saved customs) and width slider
7. Lockable sidebar, fullscreen, keyboard shortcuts
8. Per-page undo/redo
9. Sidecar JSON load/save, idle autosave, crash-recovery lockfile
10. Blank page insertion
11. Flatten-export to PDF

### Phase 2 — Math-first

- Graph tool: rectangle → coordinate plane, `y = f(x)` with mathjs, adaptive
  sampling, discontinuity detection, domain restrictions
- LaTeX text objects via KaTeX
- Number line tool with open/closed endpoints
- Shape tools: segment / ray / line with arrowheads, circle, polygon
- Laser pointer / fading temporary ink
- Table of values linked to graph functions

### Phase 3 — Geometry & polish

- Protractor and ruler overlays (draggable, rotatable)
- Angle arcs with degree labels, right-angle markers, congruence ticks
- Implicit curves (`x^2 + y^2 = 9`) via marching squares
- Multi-monitor presenter view
- Page thumbnail sidebar, page reorder, page duplicate
- Parametric and inequality plotting (Algebra 2 / precalc)

### Phase 4 — Distribution

- GitHub Actions CI: lint, test, build per platform
- Auto-release on tag: Windows `.msi`, Linux `.AppImage`, Linux `.deb`,
  portable `.exe`
- Code signing (Windows) once a cert is available

## Key Risks & Mitigations

- **Stylus latency under WebView2 (Windows)**: layered canvases minimize
  repaint cost; use `pointerrawupdate` where available; escalate to native
  Wintab hooks only if measured latency is unacceptable.
- **pdfium binary distribution**: pin a version via `pdfium-render`'s download
  feature; vendor the binary in CI artifacts for reproducible builds.
- **Large PDFs / memory**: render only current ±1 page at full scale; cache
  other pages at thumbnail resolution.
- **Graph plotter edge cases**: adaptive sampling with slope thresholds plus
  discontinuity detection; unit-test against a fixture of Algebra 1 functions.
