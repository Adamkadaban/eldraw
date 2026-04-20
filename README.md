# eldraw

A cross-platform PDF annotation tool built for live math teaching. Stylus-first,
low-latency inking with a math-aware toolset — graph plotter, implicit curves,
LaTeX, protractor, ruler, number line, laser pointer, and more — on top of any
PDF or blank page.

## Features

- **PDF + blank pages** — open a PDF, mix in blank pages, reorder, duplicate,
  and delete pages from the thumbnail strip.
- **Low-latency inking** — perfect-freehand strokes driven by Pointer Events,
  with palette, widths, dash styles, and fading laser/temporary ink.
- **Math tools** — function plotter with expression parser, implicit curves
  via marching squares, LaTeX text objects, shapes, and a number-line tool.
- **Geometry overlays** — draggable protractor and ruler, angle marks.
- **Undo / redo** — full per-page history; survives page reorder, duplicate,
  and delete.
- **Autosave** — sidecar JSON next to the PDF; reopen right where you left off.
- **Presenter view** — F5 toggles a fullscreen presentation mode with a
  thumbnail strip for fast navigation.
- **Flatten export** — bake annotations back into a shareable PDF.

## Install

Prebuilt installers are attached to each [GitHub Release](https://github.com/Adamkadaban/eldraw/releases):

- Windows: `.msi` or NSIS `.exe`
- Linux: `.AppImage` or `.deb`

## Develop

```sh
pnpm install
./scripts/fetch-pdfium.sh   # downloads libpdfium into src-tauri/pdfium/
pnpm tauri dev
```

The fetch script is only required the first time (and when the pinned pdfium
version changes). It verifies the SHA-256 of the downloaded archive against
a value committed in the script. `pnpm tauri dev` works without it only if a
matching libpdfium is already installed on your system; `pnpm tauri build`
always requires the bundled copy under `src-tauri/pdfium/`.

### Checks

```sh
pnpm lint          # prettier + eslint + svelte-check
pnpm test          # vitest

cargo fmt   --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test  --manifest-path src-tauri/Cargo.toml
```

### Release

Version is bumped in lockstep across `package.json`, `src-tauri/Cargo.toml`,
and `src-tauri/tauri.conf.json`:

```sh
pnpm bump 0.2.0
cargo check --manifest-path src-tauri/Cargo.toml
git commit -am "chore(release): v0.2.0"
git tag v0.2.0 && git push origin main v0.2.0
```

Pushing the tag triggers the release workflow, which builds Windows and Linux
installers and publishes a GitHub Release with git-cliff-generated notes.

## Docs

- [PLAN.md](./PLAN.md) — full design, architecture, and roadmap
- [AGENTS.md](./AGENTS.md) — contribution rules for humans and AI agents

## License

MIT
