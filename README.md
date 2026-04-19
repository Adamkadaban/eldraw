# eldraw

A cross-platform PDF annotation tool built for live math teaching.

See [PLAN.md](./PLAN.md) for the full design and roadmap, and
[AGENTS.md](./AGENTS.md) for contribution rules.

## Dev

```sh
pnpm install
pnpm tauri dev
```

## Checks

```sh
pnpm lint          # prettier + eslint + svelte-check
pnpm test          # vitest

cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```
