# Solid.js Guidelines

## Terminology (Essential)

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

## Naming Guide: create* vs make* vs use\*

### create\* — Reactive Primitive (official Solid pattern)

- Indicates the function **creates a reactive primitive**.
- Runs once and returns something that integrates with Solid's tracking.
- Examples: `createSignal`, `createMemo`, `createEffect`.
- Use this when the primitive:
  - Sets up reactivity.
  - Registers dependencies.
  - Produces tracked reads/writes.

**Rule:** `create*` = constructs something _reactive_.

### make\* — Non-Reactive Foundation Primitive

- Indicates the function is **non-reactive**, a low-level building block.
- Provides only the essentials: setup + cleanup.
- No tracking, no dependency registration.
- Example idea:
  - `makeTimer()`: creates a timer scheduler + cleanup, returns something like `{ clear }`.
  - `createTimer()` would wrap `makeTimer()` to make it reactive.

**Rule:** `make*` = foundation utility with _zero_ reactivity.
**Used to improve composability**: the reactive version composes the non-reactive base.

### use\* — "Use an existing thing," don't create a new one

- Used **sparingly** in Solid.
- Indicates you're **using** an already-created resource instead of creating a new one.
- Examples straight from Ryan:
  - `useContext()` — because `createContext()` already _creates_ the context; `use*` just retrieves it.
  - `useTransition()` — debatable naming; does not _create_ the transition, but returns something that will.

**Rule:** `use*` = consumes or accesses something already created, not constructing new reactive machinery.

Effects are primarily intended for handling side effects that do not write to the reactive system. It's best to avoid setting signals within effects, as this can lead to additional rendering or even infinite loops if not managed carefully. Instead, it is recommended to use createMemo to compute new values that rely on other reactive values.
