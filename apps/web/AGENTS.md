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
- Prefer Tailwind utilities and `@apply`/`@layer` for styling; use CSS modules only in rare cases (e.g. multiple custom scrollbars) to prevent class collisions.
- **Logic Separation**: Never write complex logic inside component files.
  - All **pure logic** must reside in an appropriate utility file.
  - All **logic that touches state** must reside in a hook (`create*` or `use*` primitive).

## Logging

- Use the consola-based logger from `~/logger` (`logger` instance) for all runtime logging.
- Prefer tagged loggers via `logger.withTag('feature')` instead of raw `console.*`.
- Avoid `console.log`, `console.error`, and other `console.*` calls in app code; reserve direct console usage only for very short-lived debugging.

## Testing Guidelines

- When adding tests, prefer Vitest colocated next to source files (e.g. `ComponentName.test.tsx`).
- Write tests for new business logic in `src/fs`, `src/utils`, and `src/terminal`.
- Aim for meaningful coverage of critical flows (FS operations, terminal interactions) rather than raw percentages.
- **NEVER EVER EVER try to open the browser (browser subagent / read_browser_page / etc.). It is extremely bugged.** Never run browser tasks/tests unless explicitly asked. If a browser test is needed, ask the user to run it and provide the exact command.

## Commit & Pull Requests

- Use clear, imperative commit messages (e.g. `Add FS context provider`, `Fix terminal resize bug`).
- Keep changesets focused and small; separate refactors from behavioral changes when possible.
- For PRs, include: purpose, high-level changes, any breaking behavior, and screenshots or recordings for UI-impacting work.
- Link related issues or tasks and mention any follow-ups (tech debt, TODOs).

# Solid Terminology (Essential)

| Term             | Avoid Confusing With              | Definition                                                                  |
| ---------------- | --------------------------------- | --------------------------------------------------------------------------- |
| Computation      | computed                          | A scope that reruns when its dependencies change.                           |
| Core primitive   | API function                      | Built-in Solid primitive; may or may not be reactive.                       |
| Custom primitive | hook                              | User-defined primitive providing composable functionality.                  |
| Ownership / owns | —                                 | Cleanup relationship where parent computations clean up owned computations. |
| Primitive        | Hook                              | A function that provides reactivity or behavior (`create*`, `use*`).        |
| Reactive value   | signal (generic use)              | Any trackable value (signals, memos, props, stores).                        |
| Reactivity       | —                                 | System that tracks dependencies and reruns computations on change.          |
| Root             | —                                 | A computation with no owner (`createRoot`).                                 |
| Scope            | root, effect                      | A function body / code block.                                               |
| Solid            | “SolidJS” (avoid unless external) | The framework (compiler + library).                                         |
| Tracking scope   | reactive context/scope/root       | A scope that automatically tracks read signals.                             |

# Naming Guide: create* vs make* vs use\*

## create\* — Reactive Primitive (official Solid pattern)

- Indicates the function **creates a reactive primitive**.
- Runs once and returns something that integrates with Solid's tracking.
- Examples: `createSignal`, `createMemo`, `createEffect`.
- Use this when the primitive:
  - Sets up reactivity.
  - Registers dependencies.
  - Produces tracked reads/writes.

**Rule:** `create*` = constructs something _reactive_.

## make\* — Non-Reactive Foundation Primitive

- Indicates the function is **non-reactive**, a low-level building block.
- Provides only the essentials: setup + cleanup.
- No tracking, no dependency registration.
- Example idea:
  - `makeTimer()`: creates a timer scheduler + cleanup, returns something like `{ clear }`.
  - `createTimer()` would wrap `makeTimer()` to make it reactive.

**Rule:** `make*` = foundation utility with _zero_ reactivity.
**Used to improve composability**: the reactive version composes the non-reactive base.

## use\* — "Use an existing thing," don't create a new one

- Used **sparingly** in Solid.
- Indicates you're **using** an already-created resource instead of creating a new one.
- Examples straight from Ryan:
  - `useContext()` — because `createContext()` already _creates_ the context; `use*` just retrieves it.
  - `useTransition()` — debatable naming; does not _create_ the transition, but returns something that will.

**Rule:** `use*` = consumes or accesses something already created, not constructing new reactive machinery.

- Solid uses `create*` because primitives are created _once_, unlike React hooks which re-run.
- `use*` is reserved for cases where the primitive does **not** create the underlying mechanism.
- Naming is still evolving; could form a future lint rule.

- **create\*** → reactive primitive creator
- **make\*** → non-reactive foundation utility
- **use\*** → access an existing resource
- Prefer consistency with Solid core + Solid Primitives conventions

Effects are primarily intended for handling side effects that do not write to the reactive system. It's best to avoid setting signals within effects, as this can lead to additional rendering or even infinite loops if not managed carefully. Instead, it is recommended to use createMemo to compute new values that rely on other reactive values.

## Props & Reactivity

- **Never destructure props**: Destructuring `props` breaks reactivity. Use `splitProps` and `mergeProps` to separate or merge props while maintaining reactivity.
- **Props are reactive getters**: Usually, there is no need to pass accessors (functions) as props. If you pass a signal or memo value like `<Comp value={mySignal()} />`, then `props.value` inside `Comp` is already a reactive getter—no need to wrap it in an accessor.
- **Debugging Reactivity**: When debugging SolidJS, it is recommended to use `createEffect` with a log inside to track reactivity and verify when dependencies are changing.

### Child Props & The `children` Helper

- **Rule of Thumb**: Use the `children` helper when accepting `children` in your component. This ensures that children are properly resolved (functions executed, arrays flattened), memoized (preventing redundant DOM creation), and tracked in the correct scope.

  ```tsx
  import { children } from 'solid-js'
  // ...
  const resolved = children(() => props.children)
  // Use resolved() in your JSX
  ```

- **Conditional Rendering**: The helper evaluates children eagerly. To avoid unnecessary creation (e.g. for `<Show>`), condition the input:
  ```tsx
  const resolved = children(() => visible() && props.children)
  ```

> **Note:** Before implementing a custom solution, it is recommended to check **[solid-primitives](https://github.com/solidjs-community/solid-primitives)**.
> You can install individual packages using `bun add @solid-primitives/{name}` from the list below:
>
> active-element, audio, autofocus, bounds, clipboard, connectivity, context, cursor, date, deep, destructure, devices, event-bus, event-dispatcher, event-listener, event-props, filesystem, fullscreen, geolocation, graphql, history, i18n, immutable, input, intersection-observer, keyboard, keyed, lifecycle, map, media, memo, mouse, mutation-observer, network, pagination, platform, pointer, props, raf, range, refs, resize-observer, resource, rootless, scheduled, script-loader, scroll, selection, share, signal-builders, start, static-store, storage, stream, styles, template, timer, title, transition, trigger, tween, upload, utils, websocket, workers

## Reactive Utilities & Secondary Primitives

### startTransition

- `import { startTransition } from "solid-js"`
- Like `useTransition` but without a pending state.
- Wraps updates to maintain UI until async resources resolve (prevents flickers).

### createSelector

- `import { createSelector } from "solid-js"`
- Parameterized boolean signal for efficient selection status.
- Reduces updates from $O(n)$ to $O(2)$ (only old and new matches update).
- **Usage:**
  ```tsx
  const isSelected = createSelector(selectedId)
  <For each={list()}>
    {(item) => <li classList={{ active: isSelected(item.id) }}>{item.name}</li>}
  </For>
  ```

SOLID ASYNC + SUSPENSE CHEAT SHEET

1. Suspense

- Tracks resources read under it
- Blocks DOM attach, not execution
- Shows fallback until all resources inside are ready
- Children are built before resolve → fast swap

Use:
<Suspense fallback={...}>{children}</Suspense>

2. What triggers Suspense

- ONLY calling a resource: data()
- Signals, memos, props do nothing

3. Never wrap resources in <Show> inside Suspense
   Bad: <Suspense><Show when={res()} /></Suspense>
   Good: <Suspense>{res()}</Suspense>

4. Nested Suspense = isolate loading
   Each Suspense waits only for resources read inside it

5. createResource

- Keyed async data
- Cache + refetch + loading + error
  const [res] = createResource(key, fetcher)

6. createAsync

- Fire-and-forget async
- No keys, no refetch
  const data = createAsync(fetcher)

7. startTransition

- Wrap key changes
- Old UI stays until new resource resolves
  startTransition(() => setKey(x))

8. useTransition

- Gives pending() while transitions run

9. Resource-driven UI pattern
   const [font] = createResource(activeFont, loadFont)

<Suspense fallback={...}>
  <Editor font={font()} />
</Suspense>

startTransition(() => setActiveFont("Inter"))

10. Rules

- Want no flicker → Suspense
- Want keyed async → createResource
- Want smooth swaps → startTransition
- Want loading UI → useTransition
- Want partial loading → nested Suspense

SOLID PRIMITIVES — POWER LAYER OVER createResource

CORE IDEA
All these wrap either:

- the Resource
- the fetcher
- or the storage
  to add TanStack-Query-like behavior without replacing Solid.

---

## FETCHER MODIFIERS

makeAbortable / createAbortable

- Adds AbortController
- Auto-aborts previous request or on timeout
- createAbortable auto-cleans on dispose

Use when:

- You have refetching
- You have slow / cancelable requests

Pattern:
signal() → pass to fetch()
filterErrors() → ignore AbortError

---

makeRetrying

- Retries failed fetcher N times with delay

Use when:

- Network flakey
- API unstable

---

makeCache

- Caches fetcher by source key
- Optional persistence (localStorage)
- TTL / expiry
- Invalidate by key or all

Use when:

- Query keys
- Avoid duplicate fetches
- Offline / reload support

---

## RESOURCE MODIFIERS

createAggregated

- Prevents overwrite
- Merges new data into old

Rules:
Array → append  
Object → shallow merge  
String → append  
null doesn’t overwrite  
Else → array wrap

Use when:

- Pagination
- Streaming
- Infinite scroll
- Chunked APIs

---

createDeepSignal (storage)

- Makes resource deeply reactive
- Only changed nested fields trigger updates

Use when:

- Big JSON
- Tables
- Avoid rerender storms

Warning:
Base signal no longer changes → must deepTrack() if combining with aggregation

---

## createFetch

createResource but with fetch + modifiers

Built-in:
withAbort
withTimeout
withRetry
withCache
withAggregation
withRefetchEvent
withCatchAll
withCacheStorage

Use when:

- You want a TanStack-Query-like fetch layer
- But still native Solid Suspense + Resource

---

## STREAMS

createStream

- MediaStream as a resource
- loading / error / refetch / stop

createAmplitudeStream

- Audio amplitude signal

Use when:

- Camera
- Mic
- Screen capture

---

## WEBSOCKETS

createWS / makeWS

- WebSocket with message signal

makeReconnectingWS

- Auto reconnect

makeHeartbeatWS

- Ping/pong keepalive

createWSState

- readyState signal

Use when:

- Live data
- Presence
- Multiplayer
- Chat

---

## STATIC STORES

createStaticStore

- Shallow reactive object
- Fixed shape
- Each property = signal

createDerivedStaticStore

- Static store derived from a signal

Use when:

- Window size
- Mouse
- Layout state
- Event state

---

## HOW IT ALL COMPOSES

You stack:
source → makeCache → makeRetrying → makeAbortable → createResource → createAggregated → Suspense

That gives you:
Keys  
Cache  
Retry  
Abort  
Streaming  
Pagination  
Fine-grained reactivity  
Suspense + transitions  
All without a query client
