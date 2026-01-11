# AGENTS_SOLID.md — SolidJS Guidelines

> Comprehensive guide for SolidJS development patterns, reactivity rules, and async handling.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Terminology](#terminology)
3. [Naming Conventions](#naming-conventions)
4. [Props & Reactivity](#props--reactivity)
5. [Async & Suspense](#async--suspense)
6. [Solid Primitives Library](#solid-primitives-library)

---

## Core Principles

| Principle         | Rule                                                                           |
| ----------------- | ------------------------------------------------------------------------------ |
| **TypeScript**    | Use functional components with `PascalCase` filenames (e.g., `EditorPane.tsx`) |
| **Exports**       | Prefer named exports over default exports                                      |
| **Batching**      | Wrap multiple signal/store updates in `batch(() => { ... })`                   |
| **One Component** | One component per file                                                         |
| **Effects**       | Avoid setting signals in effects—use `createMemo` for derived values           |

### Reactivity Rules

> ⚠️ **NEVER destructure `props`**—it kills reactivity. Use `splitProps` or access `props.property` directly.

- Props are reactive getters—no need to wrap `props.value` in a function
- Use `batch()` for simultaneous signal updates
- Debug reactivity with `createEffect` containing a log statement

---

## Terminology

| Term             | Avoid Confusing With | Definition                                                    |
| ---------------- | -------------------- | ------------------------------------------------------------- |
| Computation      | computed             | A scope that reruns when dependencies change                  |
| Core primitive   | API function         | Built-in Solid primitive; may or may not be reactive          |
| Custom primitive | hook                 | User-defined primitive providing composable functionality     |
| Ownership        | —                    | Cleanup relationship: parent computations clean up owned ones |
| Primitive        | Hook                 | A function providing reactivity/behavior (`create*`, `use*`)  |
| Reactive value   | signal (generic)     | Any trackable value (signals, memos, props, stores)           |
| Root             | —                    | A computation with no owner (`createRoot`)                    |
| Scope            | root, effect         | A function body / code block                                  |
| Tracking scope   | reactive context     | A scope that automatically tracks read signals                |

---

## Naming Conventions

### `create*` — Reactive Primitives

Creates a **reactive primitive** that integrates with Solid's tracking system.

```tsx
createSignal() // Signal with getter/setter
createMemo() // Derived reactive value
createEffect() // Side effect on dependency change
```

**Use when:**

- Setting up reactivity
- Registering dependencies
- Producing tracked reads/writes

### `make*` — Non-Reactive Foundations

Creates a **non-reactive building block** with only setup + cleanup.

```tsx
makeTimer() // Timer scheduler + cleanup, returns { clear }
// createTimer() would wrap makeTimer() to add reactivity
```

**Use when:**

- Building low-level utilities
- Composing into reactive primitives
- Zero reactivity needed

### `use*` — Access Existing Resources

**Consumes** an already-created resource rather than creating new reactive machinery.

```tsx
useContext() // Retrieves context created by createContext()
useTransition() // Accesses transition state
```

**Use when:**

- Accessing existing contexts
- Retrieving already-created resources

---

## Props & Reactivity

### The `children` Helper

Always use the `children` helper when accepting `props.children`:

```tsx
import { children } from 'solid-js'

const resolved = children(() => props.children)
// Use resolved() in JSX
```

**Benefits:**

- Properly resolves children (functions executed, arrays flattened)
- Memoizes to prevent redundant DOM creation
- Tracks in the correct scope

**Conditional rendering tip:**

```tsx
const resolved = children(() => visible() && props.children)
```

---

## Async & Suspense

### Quick Reference

| Primitive         | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `Suspense`        | Shows fallback until resources resolve        |
| `createResource`  | Keyed async data with cache, refetch, loading |
| `createAsync`     | Fire-and-forget async (no keys, no refetch)   |
| `startTransition` | Keeps old UI until new resource resolves      |
| `useTransition`   | Provides `pending()` during transitions       |

### Suspense Rules

1. **Only resources trigger Suspense**—signals, memos, and props do not
2. **Never wrap resources in `<Show>`** inside Suspense:

   ```tsx
   // ❌ Bad
   <Suspense><Show when={res()} /></Suspense>

   // ✅ Good
   <Suspense>{res()}</Suspense>
   ```

3. **Nested Suspense** isolates loading states—each waits only for its own resources

### Pattern: Resource-Driven UI

```tsx
const [font] = createResource(activeFont, loadFont)

<Suspense fallback={<Spinner />}>
  <Editor font={font()} />
</Suspense>

// Smooth transition on change
startTransition(() => setActiveFont("Inter"))
```

### Decision Guide

| Need              | Use               |
| ----------------- | ----------------- |
| No flicker        | `Suspense`        |
| Keyed async       | `createResource`  |
| Smooth swaps      | `startTransition` |
| Loading indicator | `useTransition`   |
| Partial loading   | Nested `Suspense` |

---

## Solid Primitives Library

> 💡 Before implementing custom solutions, check **[solid-primitives](https://github.com/solidjs-community/solid-primitives)**.
>
> Install: `bun add @solid-primitives/{name}`

### Available Packages

`active-element` `audio` `autofocus` `bounds` `clipboard` `connectivity` `context` `cursor` `date` `deep` `destructure` `devices` `event-bus` `event-dispatcher` `event-listener` `event-props` `filesystem` `fullscreen` `geolocation` `graphql` `history` `i18n` `immutable` `input` `intersection-observer` `keyboard` `keyed` `lifecycle` `map` `media` `memo` `mouse` `mutation-observer` `network` `pagination` `platform` `pointer` `props` `raf` `range` `refs` `resize-observer` `resource` `rootless` `scheduled` `script-loader` `scroll` `selection` `share` `signal-builders` `start` `static-store` `storage` `stream` `styles` `template` `timer` `title` `transition` `trigger` `tween` `upload` `utils` `websocket` `workers`

---

### Fetcher Modifiers

| Modifier        | Purpose                                      |
| --------------- | -------------------------------------------- |
| `makeAbortable` | Adds AbortController, auto-aborts on timeout |
| `makeRetrying`  | Retries failed requests N times with delay   |
| `makeCache`     | Caches by key with TTL, optional persistence |

### Resource Modifiers

| Modifier           | Purpose                                           |
| ------------------ | ------------------------------------------------- |
| `createAggregated` | Merges new data into old (pagination, streaming)  |
| `createDeepSignal` | Deeply reactive resource (avoids rerender storms) |

**Aggregation Rules:**

- Array → append
- Object → shallow merge
- String → append
- null → no overwrite

### `createFetch`

TanStack-Query-like fetch layer with native Solid integration:

```tsx
// Built-in modifiers:
;(withAbort,
	withTimeout,
	withRetry,
	withCache,
	withAggregation,
	withRefetchEvent,
	withCatchAll,
	withCacheStorage)
```

### Streams

| Primitive               | Purpose                   |
| ----------------------- | ------------------------- |
| `createStream`          | MediaStream as a resource |
| `createAmplitudeStream` | Audio amplitude signal    |

### WebSockets

| Primitive             | Purpose                       |
| --------------------- | ----------------------------- |
| `createWS` / `makeWS` | WebSocket with message signal |
| `makeReconnectingWS`  | Auto reconnect                |
| `makeHeartbeatWS`     | Ping/pong keepalive           |
| `createWSState`       | readyState signal             |

### Static Stores

| Primitive                  | Purpose                              |
| -------------------------- | ------------------------------------ |
| `createStaticStore`        | Shallow reactive object, fixed shape |
| `createDerivedStaticStore` | Static store derived from a signal   |

**Use for:** Window size, mouse position, layout state, event state

---

### Composition Pattern

Stack primitives for full-featured data fetching:

```
source → makeCache → makeRetrying → makeAbortable → createResource → createAggregated → Suspense
```

**Result:** Keys, cache, retry, abort, streaming, pagination, fine-grained reactivity, Suspense, and transitions—all without a query client.
