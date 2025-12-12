# Repository Guidelines

## Project Structure & Modules
- App entrypoints live in `src/App.tsx` and `src/index.tsx`.
- Shared UI, terminal, and FS logic is under `src/components`, `src/terminal`, and `src/fs`.
- Cross-cutting utilities and types reside in `src/utils` and `src/types`.
- Global styles are defined in `src/styles.css` and `tailwind.config.ts`.

## Build, Test, and Development
- `bun run dev` / `bun start`: start Vite dev server on port 3000.
- `bun run build`: production build to `dist/`.
- `bun run serve`: preview the built app from `dist/`.
- `bun run lint`: run ESLint using `@repo/eslint-config/solid` (no warnings allowed).
- No test runner is configured in this app; add one per feature if needed.

## Coding Style & Naming
- Use TypeScript and SolidJS with functional components (`PascalCase` filenames, e.g. `EditorPane.tsx`).
- Prefer named exports; avoid default exports for components and utilities.
- When updating more than one Solid signal/store in the same tick, wrap the setters in `batch(() => { ... })` to prevent redundant recomputations.
- Keep modules focused; colocate feature-specific code under `src/fs`, `src/terminal`, or `src/components/fs`.
- Follow the shared ESLint config; fix all reported issues before committing.
- Client-only app: browser globals like `window` are always present; skip `typeof window !== 'undefined'` guards.

## Logging
- Use the consola-based logger from `~/logger` (`logger` instance) for all runtime logging.
- Prefer tagged loggers via `logger.withTag('feature')` instead of raw `console.*`.
- Avoid `console.log`, `console.error`, and other `console.*` calls in app code; reserve direct console usage only for very short-lived debugging.

## Testing Guidelines
- When adding tests, prefer Vitest colocated next to source files (e.g. `ComponentName.test.tsx`).
- Write tests for new business logic in `src/fs`, `src/utils`, and `src/terminal`.
- Aim for meaningful coverage of critical flows (FS operations, terminal interactions) rather than raw percentages.

## Commit & Pull Requests
- Use clear, imperative commit messages (e.g. `Add FS context provider`, `Fix terminal resize bug`).
- Keep changesets focused and small; separate refactors from behavioral changes when possible.
- For PRs, include: purpose, high-level changes, any breaking behavior, and screenshots or recordings for UI-impacting work.
- Link related issues or tasks and mention any follow-ups (tech debt, TODOs).
# Solid Terminology (Essential)

| Term             | Avoid Confusing With          | Definition |
|------------------|-------------------------------|------------|
| Computation      | computed                      | A scope that reruns when its dependencies change. |
| Core primitive   | API function                  | Built-in Solid primitive; may or may not be reactive. |
| Custom primitive | hook                          | User-defined primitive providing composable functionality. |
| Ownership / owns | —                             | Cleanup relationship where parent computations clean up owned computations. |
| Primitive        | Hook                          | A function that provides reactivity or behavior (`create*`, `use*`). |
| Reactive value   | signal (generic use)          | Any trackable value (signals, memos, props, stores). |
| Reactivity       | —                             | System that tracks dependencies and reruns computations on change. |
| Root             | —                             | A computation with no owner (`createRoot`). |
| Scope            | root, effect                  | A function body / code block. |
| Solid            | “SolidJS” (avoid unless external) | The framework (compiler + library). |
| Tracking scope   | reactive context/scope/root   | A scope that automatically tracks read signals. |


# Naming Guide: create* vs make* vs use*

## create* — Reactive Primitive (official Solid pattern)
- Indicates the function **creates a reactive primitive**.
- Runs once and returns something that integrates with Solid's tracking.
- Examples: `createSignal`, `createMemo`, `createEffect`.
- Use this when the primitive:
  - Sets up reactivity.
  - Registers dependencies.
  - Produces tracked reads/writes.

**Rule:** `create*` = constructs something *reactive*.


## make* — Non-Reactive Foundation Primitive
- Indicates the function is **non-reactive**, a low-level building block.
- Provides only the essentials: setup + cleanup.
- No tracking, no dependency registration.
- Example idea:
  - `makeTimer()`: creates a timer scheduler + cleanup, returns something like `{ clear }`.
  - `createTimer()` would wrap `makeTimer()` to make it reactive.

**Rule:** `make*` = foundation utility with *zero* reactivity.
**Used to improve composability**: the reactive version composes the non-reactive base.


## use* — "Use an existing thing," don't create a new one
- Used **sparingly** in Solid.
- Indicates you're **using** an already-created resource instead of creating a new one.
- Examples straight from Ryan:
  - `useContext()` — because `createContext()` already *creates* the context; `use*` just retrieves it.
  - `useTransition()` — debatable naming; does not *create* the transition, but returns something that will.

**Rule:** `use*` = consumes or accesses something already created, not constructing new reactive machinery.

Ryan's rationale (compressed):
- Solid uses `create*` because primitives are created *once*, unlike React hooks which re-run.
- `use*` is reserved for cases where the primitive does **not** create the underlying mechanism.
- Naming is still evolving; could form a future lint rule.



- **create\*** → reactive primitive creator
- **make\*** → non-reactive foundation utility
- **use\*** → access an existing resource
- Prefer consistency with Solid core + Solid Primitives conventions
