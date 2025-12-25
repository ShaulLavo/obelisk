# Repository Guidelines

## General Principles

> **Always opt in for adding logs and other debug tools and asking the user for input when not sure.**

- **Be a Good Citizen**: If you see a problem while working and it's easy to fix, fix it!

## Project Structure & Modules

- Monorepo managed with Turbo and Bun.
- Applications live in `apps/`:
  - `apps/web`: SolidJS + Vite + Tailwind v4 web client.
  - `apps/server`: Bun + Elysia API server.
  - `apps/desktop`: Tauri + Rust desktop shell.
- Shared packages live in `packages/` (UI, code editor, fs, lexer, logger, perf, utils, icons, etc).

## Build, Dev & Lint

- Install deps: `bun install` (Node ≥ 18, Bun as package manager).
- Run all apps in dev: `bun run dev`. -- never ever do this ask user to do it
- Example focused dev run: `bun run dev --filter web` or `--filter server`. -- never ever do this ask user to do it
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

- **Never use `any`**: Avoid TypeScript's `any` type; use proper types, `unknown`, or generics instead.
- **One hook/component per file**: Each hook and component should have its own file; do not define multiple components or hooks in a single file.
- **Never Nester**: Tolerate only up to three levels of code depth (nesting). Anything beyond requires refactoring.
  - **Extraction**: Refactor logic into separate functions.
  - **Early Return**: Use guard clauses to break out early and avoid deep `else` blocks.
  - **Data Structures**: Use arrays/maps/sets and simple loops instead of deeply nested loops.
  - **External Libraries**: Use utilities to simplify complex logic instead of manual nested loops.
- **Never support backward compatibility**: We do not support backward compatibility. Remove any code that exists solely for this purpose.
- Always fix ESLint and formatting issues before opening a PR.
- **Enums & Constants**: Avoid regular `enum`. Use `const enum` (for inlining) or `object as const` (for runtime access) instead. While strings with strong TypeScript typing are fine, the `enum` semantic is preferred for clarity.

## Styling & CSS

- **Framework**: We use **Tailwind CSS v4** (`@tailwindcss/vite`).
- **CSS Files**: Global styles and theme configuration are in `apps/web/src/styles.css` (using `@theme`).
- **Component Styles**:
  - Use Tailwind utility classes directly in JSX for structure and layout.
  - **Animations**: Use `@apply` for animation classes defined in CSS.
- **Icons**: Use icons from `@repo/icons`. Do not use custom SVGs.

## SolidJS Props & Reactivity

- **Never destructure props**: Destructuring `props` breaks reactivity. Use `splitProps` and `mergeProps` to separate or merge props while maintaining reactivity.
- **Props are reactive getters**: Usually, there is no need to pass accessors (functions) as props. If you pass a signal or memo value like `<Comp value={mySignal()} />`, then `props.value` inside `Comp` is already a reactive getter—no need to wrap it in an accessor.

## Greenfield & Performance Philosophy

- **Greenfield App**: This is a strictly greenfield project. Treat it as such.
- **Zero Backward Compatibility**: Never keep backward compatibility. There is no such thing as a breaking change here; we optimize for the best possible implementation.
- **Performance & Cleanliness Above All**: Write the cleanest, most performant code at all costs. Refactor aggressively.

## Testing Guidelines

- No global test runner is enforced yet; prefer adding tests close to the code (`*.test.ts` / `*.test.tsx`).
- **Runners**: We use **Vitest** for unit tests and **Playwright** (`@vitest/browser-playwright`) for browser/benchmark tests.
- When introducing tests to a package, add a `test` script to that package and document how to run it in the README.
- Keep tests fast and deterministic; avoid hitting real external services.
- **Never run browser tasks/tests unless explicitly asked.** If a browser test is needed, ask the user to run it and provide the exact command.

## Commit & Pull Request Guidelines

- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/). Keep the title (subject line) short and concise; use the commit description for detailed context, rationale, and technical explanations.
- Group related changes; avoid large, mixed-topic commits.

### Shared packages

- `@repo/fs`: virtual filesystem store/build helpers over File System Access API/OPFS (createFs, buildFsTree, VFile/VDir) used by the web client for local/OPFS/memory roots.
- `@repo/code-editor`: Solid-based editor stack (hidden textarea input, piece-table snapshots, cursor/selection providers, selection overlays, gutter + line virtualization).
- `@repo/ui`: shared headless UI primitives (Radix-style components, resizable panels, toaster) consumed across apps.
- `@repo/utils`: binary/text heuristics, file parsing, byte formatting, and piece-table operations (`createPieceTableSnapshot`, `getPieceTableText`, etc.).
- `@repo/perf`: tracing helpers (`trackOperation`, `trackMicro`, perf store/logging) used around FS + parsing work.
- `@repo/logger`: scoped Consola loggers for `web`, `server`, etc.
- `@repo/icons`: Solid wrappers around VS Code icon packs built via Bun scripts.
- `@repo/keyboard`: keymap/parser utilities for editor shortcuts.

## Additional Code Conventions & Patterns

- Persist long-lived UI state with `makePersisted`: use `localforage` for large FS/tree data and `dualStorage` when values must stay in both session/local storage (split sizes, focus-related prefs).
- When multiple Solid signals/stores need updates in the same tick, wrap the setters in `batch(() => { ... })` (e.g. FS tree and metadata updates) to avoid redundant recomputations.
- When touching the FS, go through `FsProvider` actions so handle caches, parse stats, and piece tables stay in sync; `FsSource` is always one of `'local' | 'opfs' | 'memory'`.
- Instrument expensive work (tree building, file streaming, parsing) with `@repo/perf` helpers and log via `@repo/logger.withTag(...)` for traceability.
- Register any DOM region that wants keyboard focus affordances with `FocusProvider` (`useFocusManager().registerArea`) so the `StatusBar` and editor scope logic stay accurate.
- `@repo/code-editor` expects a `TextEditorDocument` that exposes the current text plus an `updatePieceTable` callback; wrap mutations in the provided updater and keep cursor/selection state in sync with the cursor hooks.
- Terminal behavior should route through `apps/web/src/terminal/commands.ts` and `createTerminalController` to ensure `LocalEchoController` continues to own prompt/fit logic.
- Favor the existing zod-based env loaders (`apps/web/src/env.ts`, `apps/server/src/env.ts`) when introducing new env vars to keep validation centralized.
