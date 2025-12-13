# Repository Guidelines

## Project Structure & Modules

- Monorepo managed with Turbo and Bun.
- Applications live in `apps/`:
  - `apps/web`: SolidJS + Vite web client.
  - `apps/server`: Bun + Elysia API server.
  - `apps/desktop`: Tauri desktop shell.
- Shared packages live in `packages/` (UI, code editor, fs, logger, eslint/ts configs).

## Build, Dev & Lint

- Install deps: `bun install` (Node ≥ 18, Bun as package manager).
- Run all apps in dev: `bun run dev`.
- Example focused dev run: `bun run dev --filter web` or `--filter server`.
- Build all: `bun run build`.
- Lint: `bun run lint` (uses `@repo/eslint-config`).
- Format: `bun run format` (Prettier for `ts`, `tsx`, `md`).
- Type-check: `bun run check-types`.
- Logger toggles: `bun run generate:logger-toggles` regenerates `packages/logger/src/utils/toggleDefaults.ts` (auto-runs via `predev`/`prebuild`).

## Coding Style & Naming

- Languages: TypeScript/TSX for apps and packages.
- Indentation: tabs; keep existing single-quote, no-semicolon style.
- Components: `PascalCase` (e.g. `MainLayout.tsx`).
- Functions/variables: `camelCase`; files generally `PascalCase.tsx` for components, `camelCase.ts` for utilities.
- **Icons**: Use icons from `@repo/icons`. Do not use custom SVGs.
- **Never use `any`**: Avoid TypeScript's `any` type; use proper types, `unknown`, or generics instead.
- **One hook/component per file**: Each hook and component should have its own file; do not define multiple components or hooks in a single file.
- **Never support backward compatibility**: We do not support backward compatibility. Remove any code that exists solely for this purpose.
- Always fix ESLint and formatting issues before opening a PR.

## Testing Guidelines

- No global test runner is enforced yet; prefer adding tests close to the code (`*.test.ts` / `*.test.tsx`).
- When introducing tests to a package, add a `test` script to that package and document how to run it in the README.
- Keep tests fast and deterministic; avoid hitting real external services.

## Commit & Pull Request Guidelines

- Commits: short, present-tense summaries, optionally scoped, e.g. `web: improve terminal resizing`.
- Group related changes; avoid large, mixed-topic commits.
- PRs should include:
  - A clear description of the change and motivation.
  - Notes on how you tested it (commands, browsers, platforms).
  - Screenshots or recordings for noticeable UI changes.
  - Mention of any breaking changes or migrations.

## Security & Configuration

- Do not commit secrets or `.env` files; `apps/server` loads env via `dotenv`.
- Document required env vars in an example file (e.g. `apps/server/.env.example`) when adding new configuration.

## Current Capabilities

### apps/web

- Main layout (`apps/web/src/Main.tsx`) wraps the file workspace and terminal in vertically stacked `@repo/ui/resizable` panels whose split sizes persist via `makePersisted` + `dualStorage`.
- `FsProvider` (`apps/web/src/fs/context/FsProvider.tsx`) builds trees for the `'local' | 'opfs' | 'memory'` sources using `@repo/fs`, caches handles, streams file bytes/text, tracks parse stats, and exposes create/delete/mutation helpers so `TreeView` + `SelectedFilePanel` can lazily load folders/files.
- File viewing leverages `@repo/code-editor` for text (piece-table-backed editing, cursor/selection virtualization) and `BinaryFileViewer` for hex/ASCII previews with stats from `@repo/utils`; state such as expanded folders, selection, preview bytes, and piece tables persist via `localforage`.
- The terminal (`apps/web/src/components/Terminal.tsx`) boots `xterm.js` with a local-echo command loop (`help`, `echo`, `clear`), while `FocusProvider` + `StatusBar` surface the active focus area, selected file path, file size, FS source, and loading/error states.
- `serverRoutesProbe` and the Eden `client` keep the UI aware of Bun API health, logging via `@repo/logger`.

### apps/server

- Bun + Elysia server (`apps/server/src/index.ts`) exposes health (`/`), param echo (`/id/:id`), and validated mirror (`POST /mirror`) routes behind CORS configured from a layered `.env` loader (`apps/server/src/env.ts`) that merges repo-root and app-level env files with zod validation.

### apps/desktop

- Thin Tauri shell (`apps/desktop/src-tauri`) that bundles the web client, wires `tauri_plugin_opener`, and exposes a sample `greet` command; `vibe_lib::run()` is the desktop entry point.

### Shared packages

- `@repo/fs`: virtual filesystem store/build helpers over File System Access API/OPFS (createFs, buildFsTree, VFile/VDir) used by the web client for local/OPFS/memory roots.
- `@repo/code-editor`: Solid-based editor stack (hidden textarea input, piece-table snapshots, cursor/selection providers, selection overlays, gutter + line virtualization).
- `@repo/ui`: shared headless UI primitives (Radix-style components, resizable panels, toaster) consumed across apps.
- `@repo/utils`: binary/text heuristics, file parsing, byte formatting, and piece-table operations (`createPieceTableSnapshot`, `getPieceTableText`, etc.).
- `@repo/perf`: tracing helpers (`trackOperation`, `trackMicro`, perf store/logging) used around FS + parsing work.
- `@repo/logger`: scoped Consola loggers for `web`, `server`, etc.
- `@repo/icons`: Solid wrappers around VS Code icon packs built via Bun scripts.
- `@repo/keyboard`: keymap/parser utilities for editor shortcuts.

## Outstanding TODOs

- apps/web/src/styles.css:9 — Replace the stopgap native scrollbar styling with a full custom scrollbar implementation.
- apps/web/src/fs/context/FsProvider.tsx:412 — Rework how the last-opened file path syncs to `localStorage`; the current effect is acknowledged as suboptimal.
- apps/web/src/components/BinaryFileViewer.tsx:129 — Replace TanStack Virtualizer with a lean custom implementation that holds less heap when rendering large binaries.
- packages/code-editor/src/editor/components/Input.tsx:16 — Optimize the hidden textarea input to avoid slowdown on very large files (hundreds of thousands of lines).

## Additional Code Conventions & Patterns

- Persist long-lived UI state with `makePersisted`: use `localforage` for large FS/tree data and `dualStorage` when values must stay in both session/local storage (split sizes, focus-related prefs).
- When multiple Solid signals/stores need updates in the same tick, wrap the setters in `batch(() => { ... })` (e.g. FS tree and metadata updates) to avoid redundant recomputations.
- When touching the FS, go through `FsProvider` actions so handle caches, parse stats, and piece tables stay in sync; `FsSource` is always one of `'local' | 'opfs' | 'memory'`.
- Instrument expensive work (tree building, file streaming, parsing) with `@repo/perf` helpers and log via `@repo/logger.withTag(...)` for traceability.
- Register any DOM region that wants keyboard focus affordances with `FocusProvider` (`useFocusManager().registerArea`) so the `StatusBar` and editor scope logic stay accurate.
- `@repo/code-editor` expects a `TextEditorDocument` that exposes the current text plus an `updatePieceTable` callback; wrap mutations in the provided updater and keep cursor/selection state in sync with the cursor hooks.
- Terminal behavior should route through `apps/web/src/terminal/commands.ts` and `createTerminalController` to ensure `LocalEchoController` continues to own prompt/fit logic.
- Favor the existing zod-based env loaders (`apps/web/src/env.ts`, `apps/server/src/env.ts`) when introducing new env vars to keep validation centralized.
