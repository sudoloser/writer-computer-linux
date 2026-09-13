# Android Termux toolchain fallback spec

## Problem

On Termux (`process.platform === "android"`), every `vp` command fails at startup:

- `vite-plus` 0.3.1 publishes no `vite-plus.android-arm64.node` native binding and no
  `@voidzero-dev/vite-plus-android-arm64` / `-wasm32-wasi` optional dependency, even though
  `binding/index.cjs` already contains an `android/arm64` load branch. `dist/bin.js` imports
  `run()` from that binding eagerly, so even pure-JS commands (`--help`, `config`) crash.
- All `#!/usr/bin/env` shebangs are broken on Termux (`env` lives at `$PREFIX/bin/env`,
  `/usr/bin/env` does not exist), so `vp`, `pnpm`, and every `node_modules/.bin` entry must be
  launched explicitly via `node <bin>`.

The sub-tools themselves DO ship Android binaries and run fine: verified `oxlint 1.81.0`,
`oxfmt 0.66.0`, `vitest 4.1.11 android-arm64` via `node <pkg>/bin/...` directly.

## Decision

Do not fork or rebuild the `vp` Rust core. Add one repo-owned fallback shim,
`scripts/vp-android.mjs`, that maps the `vp` subcommands this repo uses onto the underlying
tools directly. Per `docs/consolidation.md` the command table is a single registry in that
file — adding the next subcommand edits one file, not `package.json` + docs + scripts.

## Scope

Supported (everything `package.json`, `AGENTS.md`, and `vite.config.ts` staged hooks need):

- `install` / `i` → `pnpm install`
- `exec <cmd...>` → `pnpm exec <cmd...>`
- `run <script>` (incl. `pkg#script` and `-r/--recursive`) → `pnpm` filter/recursive run
- `dev` / `build` / `preview` → project-local `vite` (aliased to `vite-plus-core`)
- `test` → project-local `vitest run` (bare `test` defaults to `run`, never watch)
- `lint` → `oxlint` (project-local, else global bundled copy)
- `fmt` → `oxfmt` (same resolution)
- `check` → `oxfmt --check` + `oxlint` + `tsc --noEmit`; `--fix` swaps `--check` for `--write`
- `staged` → `oxlint` + `oxfmt --write` on `git diff --cached` JS/TS files
- `--version` / `help` → shim version + command list

Explicitly out of scope: `config`, `hooks`, `create`, `migrate`, `pack`, `doc`, `cache`,
`publish` flows. The shim exits non-zero with "run full `vp` on desktop Linux/macOS" for those.

## Rules

- Never import `vite-plus`'s `binding` or `dist/bin.js` from the shim (that is the crash).
  Resolve tool binaries from project `node_modules` first, global `$PREFIX/lib/node_modules/vite-plus/node_modules` second.
- Always spawn Node-based bins as `node <bin> <args>` (never rely on shebangs).
- `pnpm` is spawned as `node $PREFIX/bin/pnpm` when `/usr/bin/env` is missing, plain `pnpm` otherwise.
- Argument pass-through is verbatim except the documented `run`/`test`/`check` mappings above.
- Exit codes propagate; the shim prints the spawned command on failure.
