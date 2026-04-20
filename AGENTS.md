# AGENTS.md

Operating guide for any agent (human or AI) contributing to **eldraw**.

## Code Style

- **Self-documenting code first.** Use clear names and small functions. Do not
  narrate obvious behavior with comments.
- **Comments only when needed**: non-obvious intent, tricky math, workarounds,
  invariants, links to issues.
- **Docstrings are fine** at the top of non-trivial functions, modules, and
  public APIs. Keep them short and purposeful.
- **No banner / decorative comments.** No `// ========== SECTION ==========`.
- **No TODO graveyards.** If it's worth tracking, open an issue.
- **TypeScript**: `strict` mode on. Prefer discriminated unions over enums.
- **Rust**: `#![warn(clippy::pedantic)]` where practical. `cargo fmt` must pass.
- **Svelte**: one component per file; colocate styles; keep logic in `lib/`.
- **Imports**: absolute from `src/lib/...` when convenient; no cycles.
- **Errors**: never swallow. Rust uses `thiserror`; TS uses tagged result
  types for expected failures, thrown errors only for bugs.

## Linting & Testing

- Lint and test **frequently** — not just before a PR.
- Frontend: `pnpm lint` (eslint + prettier + svelte-check) and `pnpm test`
  (vitest) must pass.
- Backend: `cargo fmt --check`, `cargo clippy -- -D warnings`, and
  `cargo test` must pass.
- Every new feature ships with tests. Pure logic (plotter, parser, history,
  hit-testing) gets unit tests. UI gets component tests where reasonable.
- CI runs the full suite on every push and PR.

## Git Workflow

- **Branch per feature.** Name: `feat/<short-slug>`, `fix/<short-slug>`,
  `chore/<short-slug>`, `docs/<short-slug>`, `refactor/<short-slug>`.
- Never commit directly to `main`.
- **Conventional Commits** for every commit:
  - `feat(scope): …` / `fix(scope): …` / `chore(scope): …` / `docs: …` /
    `refactor(scope): …` / `test(scope): …` / `perf(scope): …` /
    `build: …` / `ci: …`
  - Breaking changes: `feat(scope)!: …` with a `BREAKING CHANGE:` footer.
- Rebase onto `main` before opening a PR; keep history linear.
- PR title also follows Conventional Commits.
- PR description: what, why, testing notes, screenshots/GIFs if UI.

## Review Process

1. Open a PR from the feature branch into `main`.
2. Run `pnpm lint && pnpm test` and Rust equivalents locally. CI must be
   green.
3. **Request a Copilot review** via the `copilot-review` MCP and apply the
   `copilot-second-opinion` skill. Iterate: triage every comment
   (agree / disagree / clarify), push fixes, reply, resolve threads. Repeat
   until Copilot has nothing more to say.
4. Merge only when:
   - CI is green
   - Copilot review loop is complete
   - At least one human (or supervising agent) has approved
5. **Squash merge** to keep `main` history clean. The squash commit message
   follows Conventional Commits.
6. Delete the feature branch after merge.

## Parallel Work (Subagents + Worktrees)

Each active phase should have **3–5 subagents** running in parallel, each in
its own git worktree, to keep throughput high and isolate changes.

```
eldraw/                     main checkout
eldraw-wt/
├── pdf-pipeline/           worktree: feat/pdf-pipeline
├── ink-engine/             worktree: feat/ink-engine
├── sidebar/                worktree: feat/sidebar
├── storage/                worktree: feat/storage
└── graph-tool/             worktree: feat/graph-tool
```

Create a worktree:

```sh
git worktree add ../eldraw-wt/<slug> -b feat/<slug>
```

Rules:

- One agent per worktree. No two agents touch the same worktree.
- Agents coordinate via issues / PR comments, not by editing each other's
  branches.
- Shared interfaces (types, IPC commands, data model) are **defined first**
  in a small branch that lands before dependent work begins. This avoids
  merge pain.
- If two worktrees need to touch the same file, pause one and land the other
  first.

### Suggested Parallel Splits per Phase

**Phase 1 (MVP)** — 5 worktrees:

1. `pdf-pipeline` — Tauri command + pdfium render + page cache
2. `ink-engine` — perfect-freehand + Pointer Events + layered canvas
3. `sidebar-tools` — sidebar UI, palette, widths, dash styles
4. `storage-history` — sidecar JSON schema, autosave, undo/redo
5. `app-shell` — Tauri scaffold, routing, keyboard shortcuts, fullscreen

**Phase 2 (Math-first)** — 4 worktrees:

1. `graph-tool` — plotter, parser, graph object UI
2. `latex-text` — KaTeX text objects
3. `shapes-numberline` — shape tools, number line
4. `laser-temp-ink` — laser pointer, fading ink

**Phase 3 (Geometry & polish)** — 4 worktrees:

1. `geometry-overlays` — protractor, ruler, angle marks
2. `implicit-plot` — marching squares implicit curves
3. `presenter-view` — multi-monitor, thumbnail sidebar
4. `page-ops` — reorder, duplicate, blank page polish

## Releases

Implemented in Phase 4 (`.github/workflows/release.yml`):

- Push a `v*` git tag to trigger the matrix build:
  - Windows: `.msi` + NSIS `.exe`
  - Linux: `.AppImage` + `.deb`
- `git-cliff` (`cliff.toml`) generates release notes from Conventional Commit
  history.
- Artifacts land on a draft GitHub Release, then the `publish` job flips the
  draft to published with the generated notes.
- Version is bumped in lockstep across `package.json`,
  `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` via
  `pnpm bump <semver>`. Source of truth is the git tag.

Typical release flow:

```sh
pnpm bump 0.2.0
cargo check --manifest-path src-tauri/Cargo.toml   # refresh Cargo.lock
git commit -am "chore(release): v0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

Code signing (macOS notarization, Windows Authenticode) is a follow-up once
certificates exist.

## Security & Hygiene

- Never commit secrets. `.env` is gitignored.
- Verify `pdfium` binary checksums on download.
- Treat user PDFs as untrusted input. Keep parsing in the sandboxed
  webview / pdfium; do not shell out to system tools with filenames.

---

## Plan Overview

eldraw is a Tauri 2 + Svelte app for annotating PDFs with a stylus, built
primarily for live math teaching. Phase 1 delivers an MVP with PDF rendering,
inking, a lockable sidebar, blank pages, undo/redo, and flatten-export.
Phase 2 adds math tools (graph plotter, LaTeX, number line, shapes, laser).
Phase 3 adds geometry overlays and presenter polish. Phase 4 wires up
autobuilds for `.msi`, `.exe`, `.AppImage`, and `.deb`.

See **[PLAN.md](./PLAN.md)** for the full plan, architecture, repo layout,
data model, and roadmap.
