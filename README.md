<h1 align="center">eldraw</h1>

<p align="center">
  A stylus-first PDF annotation tool, built for live math teaching.
</p>

<p align="center">
  <a href="https://github.com/Adamkadaban/eldraw/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/Adamkadaban/eldraw?include_prereleases&sort=semver"></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

---

Annotate any PDF (or blank page) with low-latency ink, a math-aware toolset,
and a lockable side panel that stays out of the way. Open a lecture PDF,
scribble a proof, drop a graph, and flatten it all back to a shareable file.

## Highlights

- **Fluid inking** — perfect-freehand strokes over Pointer Events, with
  palette, widths, dash styles, and a fading laser pointer.
- **Math tools** — function plotter with expression parser, implicit curves,
  LaTeX text, number line, shapes, protractor, and ruler.
- **PDF + blank pages** — mix, reorder, duplicate, and delete pages from a
  thumbnail strip.
- **Undo everywhere** — per-page history survives reorder, duplicate, delete.
- **Autosave** — sidecar JSON next to the PDF; reopen right where you left off.
- **Presenter view** — `F5` for a clean fullscreen mode with quick navigation.
- **Flatten export** — bake annotations back into a shareable PDF.

## Install

Grab a prebuilt installer from the
[latest release](https://github.com/Adamkadaban/eldraw/releases):

| Platform | Formats             |
| -------- | ------------------- |
| Windows  | `.msi`, NSIS `.exe` |
| Linux    | `.AppImage`, `.deb` |

Prereleases ship NSIS `.exe` only; `.msi` is stable-only.

## Shortcuts

A few favorites — the sidebar lists the rest.

| Key              | Action               |
| ---------------- | -------------------- |
| `P` / `E` / `L`  | Pen / eraser / laser |
| `1`–`9`          | Pick palette color   |
| `B`              | Insert a blank page  |
| `F5`             | Presenter mode       |
| `F`              | Fullscreen           |
| `Ctrl`+`Z` / `Y` | Undo / redo          |
| `Tab`            | Toggle sidebar pin   |

## Docs

- [PLAN.md](./PLAN.md) — design, architecture, and roadmap
- [CONTRIBUTING.md](./CONTRIBUTING.md) — dev setup, workflow, and release
- [AGENTS.md](./AGENTS.md) — contribution rules for humans and AI agents

## License

[MIT](./LICENSE)
