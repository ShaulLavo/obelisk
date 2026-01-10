# Repository Guidelines

## Core Philosophy

### Everything is a File

We embrace the "Everything is a File" philosophy, drawing inspiration from Unix, Plan 9, and Inferno.

- Resources, states, and process data should be accessible via a unified file system interface wherever possible.
- This creates a consistent and explorable surface area for the entire system (e.g., settings as JSON files, font previews as virtual files).

### Greenfield & Performance

- **Greenfield First**: This is a strictly greenfield project. We are not burdened by legacy constraints.
- **No Backward Compatibility**: We do not support backward compatibility. If a cleaner, better way exists, we take it. There are no "breaking changes" here, only improvements.
- **Performance**: Write the cleanest, most performant code at all costs. Refactor aggressively to maintain velocity and quality.

## Project Structure

This is a **Bun + Turbo** monorepo.

### Applications (`apps/`)

- **`web`**: Main client. Built with SolidJS, Vite, Tailwind v4, and Nuqs. Features a custom window manager, virtual file system, and integrated terminal/editor.
- **`server`**: Backend API. Built with Bun and Elysia. Handles font fetching, git proxying, and serving static assets. Uses Eden Treaty for type-safe client-server communication.
- **`desktop`**: Desktop shell. Built with Tauri and Rust.

### Shared Packages (`packages/`)

- **`@repo/fs`**: The heart of the system. Virtual filesystem implementation supporting Local, OPFS, and Memory backends (`createFs`, `buildFsTree`, `VFile`, `VDir`).
- **`@repo/code-editor`**: High-performance, SolidJS-based code editor with piece-table snapshots, virtualization, and decorations.
- **`@repo/ui`**: Shared headless UI primitives and design system components.
- **`@repo/settings`**: Zod schemas and types for the JSON-based settings system.
- **`@repo/utils`**: Low-level helpers for binary/text heuristics, piece-tables, etc.
- **`@repo/perf`**: Tracing and performance monitoring utilities.
- **`@repo/logger`**: Scoped logging utilities for consistent debug output.
- **`@repo/icons`**: Solid wrappers for vector icons.
- **`@repo/keyboard`**: Key binding management and shortcut handling.
- **`@repo/theme`**: Design tokens and theme configuration.
- **`@repo/eslint-config`** / **`@repo/typescript-config`**: Shared configuration.

### External & Forked Packages

- **`ghostty-web`**: Wasm-compiled Ghostty terminal emulator.
- **`sqlite-wasm`**: ES Module wrapper for SQLite.
- **`just-bash`**: In-browser bash environment simulation.
- **`nuqs-solid`**: URL state management adapter for SolidJS.
- **`vitest-browser-solid`**: Adapter for testing Solid components in Vitest Browser Mode.

## Development Workflow

### Strictly Bun

> **CRITICAL RULE**: You MUST use `bun` for all package management and script execution tasks.
>
> - **Install**: `bun install`
> - **Run Scripts**: `bun run <script>`
> - **Execute Tools**: `bun run x <tool>` (e.g., `bun run x eslint`). **NEVER** use `npx`.

### Debugging

- **Console Logs**: Use `console.log` for development debugging.
- **Format**: ALWAYS wrap complex data in `JSON.stringify(data, null, 2)` to make it readable in the terminal.
- **Production**: Use the `@repo/logger` package for persistent/production logs, not `console.log`.

### Testing

- **Unit**: Vitest (`*.test.ts`, `*.test.tsx`).
- **Browser**: Playwright via Vitest Browser Mode (`@vitest/browser-playwright`).
- **Rule**: Keep tests fast and deterministic. **NEVER** try to use the AI browser tool for testing unless explicitly instructed.

## Coding Standards

### TypeScript

- **Strict Typing**: No `any`. Use `unknown`, generics, or proper type definitions.
- **Enums**: Avoid standard `enum`. Use `const enum` or `as const` objects.

### SolidJS

- **Reactivity**: **NEVER** destructure `props`. It kills reactivity. Use `splitProps` or access `props.property` directly.
- **Getters**: Props are reactive getters. No need to wrap `props.value` in a function if it's already a signal passed down.
- **State**: Use `batch(() => ...)` for simultaneous signal updates.
- **Components**: One component per file.

### Styling

- **Engine**: Tailwind CSS v4.
- **Theme**: Defined in `apps/web/src/styles.css` using `@theme`.
- **Animations**: Use standard CSS classes or `@apply`.

### Complexity Limit ("Never Nester")

- **Max Depth**: Maintain a maximum nesting depth of 3.
- **Refactor**: Extract logic into small, focused functions.
- **Guard Clauses**: Return early to avoid `else` blocks.

## Specific Implementation Details

- **Settings**: All settings are JSON-first. The UI reflects the state of JSON configuration files. `apps/web/src/settings` contains the schema and logic.
- **Virtual FS**: Always use `FsProvider` actions to mutate the file system to ensure cache consistency and stats updates.
- **Environment**: Use Zod-based validators (`env.ts`) for all environment variables.
- **Git**: Git operations are handled via a dedicated worker (`git.worker.ts`) to keep the main thread free.

## Commit Guidelines

- **Convention**: Use [Conventional Commits](https://www.conventionalcommits.org/).
- **Granularity**: Keep commits atomic and focused. Group related changes.
- **Description**: Short title, detailed description if needed.
