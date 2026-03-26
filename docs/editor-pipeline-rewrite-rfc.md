# RFC: Editor Pipeline Rewrite — From Keypress to Pixels

## Metadata

- Status: Draft
- Scope: `packages/code-editor`
- Primary audience: editor, platform, tree-sitter, and app-shell workstreams
- Authoring intent: exhaustive implementation RFC and migration plan
- Decision type: architecture rewrite
- Backward compatibility stance: no internal backward compatibility; preserve user-facing behavior unless explicitly deferred

---

## Reading Guide

This RFC is intentionally exhaustive. It is not a vague architecture note.
It is a build plan.

If you only want the outcome:

1. Read [Executive Summary](#executive-summary)
2. Read [Design Principles](#design-principles)
3. Read [Target Architecture](#target-architecture)
4. Read [Migration Plan](#migration-plan)

If you are implementing the rewrite:

1. Read [Current State](#current-state)
2. Read [Core Runtime Model](#core-runtime-model)
3. Read [Subsystem Design](#subsystem-design)
4. Read [File Layout Proposal](#file-layout-proposal)
5. Read [Benchmarks and Acceptance Criteria](#benchmarks-and-acceptance-criteria)
6. Read [Migration Plan](#migration-plan)

---

## Executive Summary

The current editor pipeline is too reactive, too distributed, and too coupled to Solid.

The data structures are not the main problem. The main problem is that the hot path from input to paint is spread across:

- Solid signals and memos
- context reads
- line-level reactive hooks
- highlight precompute gates
- optimistic offset transforms
- layout effects
- row component rerenders
- persistence effects
- side effects inside the same orchestration layer

The rewrite proposed here does one thing above everything else:

**Move the entire hot editor loop out of Solid and into an imperative editor core plus imperative renderer.**

Solid remains the shell.

The new model is:

```text
DOM event
  -> InputController
  -> EditorCore.dispatch(transaction)
  -> core mutates synchronously
  -> core marks dirty ranges
  -> FrameScheduler requests RAF
  -> EditorView flushes only dirty rows and overlays
  -> async systems catch up later
```

Key decisions:

- Keep the piece table and line indexing model
- Keep line IDs as stable identity for rows and decorations
- Delete printable-character keybinding registration from the text path
- Use native browser text input for text insertion
- Use `keydown` only for commands and navigation
- Delete optimistic highlight offset machinery in the rewrite
- Make syntax highlighting eventually consistent instead of blocking typing
- Start with vertical virtualization only
- Handle pathological long lines with an isolated long-line mode instead of a general reactive 2D graph
- Render text imperatively with pooled row nodes and line-level caches
- Move selection and cursor rendering into one imperative overlay layer

The desired end state is a code editor with:

- one mutation entrypoint
- one frame scheduler
- one imperative view
- one async decoration pipeline
- zero per-line Solid reactivity in the hot path

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current State](#current-state)
3. [Design Principles](#design-principles)
4. [Goals](#goals)
5. [Non-Goals](#non-goals)
6. [Supported Platforms and Browser Baseline](#supported-platforms-and-browser-baseline)
7. [Accessibility](#accessibility)
8. [Success Criteria](#success-criteria)
9. [Core Runtime Model](#core-runtime-model)
10. [Target Architecture](#target-architecture)
11. [Subsystem Design](#subsystem-design)
12. [File Layout Proposal](#file-layout-proposal)
13. [Migration Plan](#migration-plan)
14. [Benchmarks and Acceptance Criteria](#benchmarks-and-acceptance-criteria)
15. [Testing Strategy](#testing-strategy)
16. [Observability](#observability)
17. [Rollout and Deletion Plan](#rollout-and-deletion-plan)
18. [Risks and Mitigations](#risks-and-mitigations)
19. [Decision Rationale](#decision-rationale)
20. [Open Decisions](#open-decisions)
21. [Appendix A: Current Hot Files](#appendix-a-current-hot-files)
22. [Appendix B: Proposed Interfaces](#appendix-b-proposed-interfaces)
23. [Appendix C: Sequence Diagrams](#appendix-c-sequence-diagrams)

---

## Problem Statement

The current editor does too much of its real-time work inside Solid.

This creates a chain of complexity problems:

1. **State ownership is fragmented**
   - document state lives in context-backed signals and stores
   - input owns edit orchestration, history, clipboard, and incremental edits
   - layout owns scroll, measurement, width scans, and virtualization
   - view owns restore logic, precompute gating, fold shifting, and minimap wiring
   - line rendering owns line resolution, highlights, bracket depths, and cached runs

2. **The hot path is not explicit**
   - the true write path is split across command handlers, input handlers, context mutation, effects, memos, and line-level rendering
   - the terminal event of the keystroke path is effectively “`Lines` rerendered”, which is a symptom of fuzzy ownership

3. **Caches exist to defend against reactive invalidation**
   - the system contains several layers of special-case caching, reuse checks, offset mapping, and partial invalidation
   - these are not the product
   - they are defensive machinery around the architecture

4. **Async enrichment is too coupled to the immediate edit path**
   - syntax highlighting and optimistic offsets participate in the same pipeline that tries to keep typing smooth
   - text insertion should not have to negotiate with decoration correctness

5. **Performance work is difficult because the frame boundary is unclear**
   - it is hard to say where the model mutation ends and painting begins
   - it is hard to profile and reason about what “should rerender” because everything is expressed as a reactive graph

The result is a system that feels over-engineered in precisely the place where the editor should feel brutally simple.

---

## Current State

### High-Level Pipeline Today

Current keyboard-to-screen flow, simplified:

```text
keyboard event / textarea input
  -> createTextEditorInput
  -> command lookup or text insertion
  -> cursor.lines.applyEdit + piece table mutation + history updates
  -> CursorContext signals/stores update
  -> TextEditorView orchestration recomputes layout/highlights/folds/restore effects
  -> LineRow hooks resolve line entry, highlights, bracket depths, cached runs
  -> Syntax builds HTML
  -> Lines rerender
  -> DOM updates
```

### Where Complexity Lives Today

The following files currently absorb too many responsibilities:

- `packages/code-editor/src/editor/components/TextEditorView.tsx`
  - orchestration god object
  - owns input, layout, highlight precompute gates, scroll restore, cursor restore, selection restore, folds, view cache, minimap wiring, scroll persistence

- `packages/code-editor/src/editor/hooks/createTextEditorInput.ts`
  - text input
  - command routing
  - keymap registration
  - history
  - selection deletion
  - clipboard
  - incremental edit emission
  - scrolling side effects

- `packages/code-editor/src/editor/cursor/context/CursorContext.tsx`
  - document state
  - line starts
  - line ids
  - line data cache
  - initialization from snapshot/content
  - edit application
  - cursor state management integration

- `packages/code-editor/src/editor/hooks/createTextEditorLayout.ts`
  - font measurement
  - fold mapping
  - virtualization
  - width scan scheduling
  - content width inference

- `packages/code-editor/src/editor/hooks/createLineHighlights.ts`
  - sorting
  - spatial indexing
  - precompute
  - offset transforms
  - dirty caches
  - reuse heuristics
  - error merging

- `packages/code-editor/src/editor/line/components/LineRow.tsx`
  - line resolution
  - line entry construction
  - highlight lookup
  - bracket lookup
  - cached runs lookup
  - render window computation

- `packages/code-editor/src/editor/selection/hooks/useSelectionRects.ts`
  - visible selection geometry
  - per-line text scans for tab-aware x coordinates

### Observed Pathologies

#### 1. The view layer owns business logic

`TextEditorView` is not just a view. It is effectively the editor runtime coordinator.

That is the wrong ownership boundary.

#### 2. The input layer is too smart

`createTextEditorInput` is a giant mixed-mode state machine that treats text insertion, deletion, navigation, clipboard, incremental edits, and persistence-adjacent scrolling as one unit.

That makes correctness expensive and change risky.

#### 3. Solid is in the wrong place

Solid is excellent at app shell state, slow-changing props, and compositional UI.

A code editor hot path is not slow-changing app shell state.

When every visible row and every overlay calculation participates in reactive dependency tracking, the runtime gets harder to reason about than the editor itself.

#### 4. Highlight offsets are compensating for the wrong architecture

The optimistic highlight offset pipeline is sophisticated.

It is also a sign that syntax highlighting is too close to the text mutation path.

Text insertion should be immediate.
Syntax coloring can lag slightly.

#### 5. 2D virtualization is too expensive conceptually for the common case

The editor is optimizing for long-line horizontal slicing as a first-class general system.

That increases complexity everywhere.

Most files are vertical-virtualization problems.
Long lines should be an isolated special mode, not the governing architecture.

### What We Should Preserve

The rewrite is not a blank-slate rejection of everything.

We should preserve:

- piece table editing model
- line starts / line math utilities
- stable line IDs
- history model concepts
- tree-sitter worker integration as an async producer
- line-level text-run generation as a rendering primitive

---

## Design Principles

### 1. Text First, Decorations Second

If the user types, text appears immediately.

Anything that is not required to show the new text must not block the keypress path.

That means:

- syntax highlighting can be stale briefly
- fold recomputation can lag
- minimap can lag
- diagnostics can lag
- width scans can lag

### 2. One Explicit Mutation Surface Per Class of Change

The runtime must have explicit, finite mutation APIs.

- `EditorCore.dispatch(transaction)` for document, selection, history, and command semantics
- `EditorCore.updateViewport(input)` for high-frequency non-undoable viewport sync
- `EditorCore.applyDecorations(snapshot)` for async non-undoable enrichment

No hidden reactive writes.
No silent state changes from view effects.

All three mutation surfaces are imperative, explicit, and observable.

### 3. One Frame Scheduler

Painting is coordinated by one scheduler.

The scheduler understands:

- text layer invalidation
- overlay invalidation
- gutter invalidation
- viewport sync
- deferred measurement

### 4. Hot State Must Not Live in Solid

Hot editor state must be plain TypeScript state owned by a non-reactive runtime.

Use `make*` naming for runtime foundations:

- `makeEditorCore`
- `makeEditorView`
- `makeInputController`
- `makeFrameScheduler`

Use `create*` only for Solid-facing wrappers or reactive adapters.

### 5. The View Must Be Dumb and Fast

The view reads precomputed state and applies DOM mutations.

It does not make architecture decisions.

### 6. Line Identity Must Be Stable

Visible rows should be keyed by stable line identity so that edits do not imply meaningless row churn.

### 7. Async Systems Are Subscribers

Tree-sitter, folds, minimap, diagnostics, and persistence listen to the editor state.

They do not participate in immediate text mutation.

### 8. Long-Line Complexity Must Be Isolated

Do not design the entire editor for the worst horizontal outlier.

Build a normal path for normal files.
Add a special mode for pathological lines.

### 9. Product Complexity Must Beat Framework Complexity

If a feature requires more logic to defend the reactive graph than to implement the feature itself, the architecture is wrong.

### 10. Deletion Is a Feature

The rewrite should delete more code than it adds in the long run.

---

## Goals

### Primary Goals

- Make the input-to-paint pipeline explicit, deterministic, and debuggable
- Remove per-line Solid reactivity from the hot path
- Remove optimistic highlight offset machinery from the rewrite path
- Make text insertion cost proportional to the actual edit plus visible dirty rows
- Make async decoration systems versioned and discardable
- Simplify rendering ownership to one imperative view runtime
- Reduce the number of moving parts required to reason about a keystroke

### Secondary Goals

- Preserve current product behavior where reasonable
- Preserve existing useful data structures
- Improve profiling clarity
- Improve long-term maintainability
- Improve ease of adding new editor features later

---

## Non-Goals

- Canvas text rendering in v1. The rewrite already changes ownership, input, and rendering boundaries; adding canvas would increase scope without solving the main problem first.
- `contenteditable`. It gives up too much control over selection, composition, and editor semantics for this rewrite.
- Perfect syntax highlighting during every intermediate edit state. The design is intentionally text-first and allows decoration lag.
- Internal API compatibility with the current editor runtime. The point of the rewrite is to reduce the migration-era surface, not preserve it.
- Rebuilding tree-sitter integration from scratch. The worker pipeline is reused and simplified at the boundary instead.

---

## Supported Platforms and Browser Baseline

This rewrite needs an explicit support matrix.

v1 target scope is desktop-first.

| Platform | Status | Notes |
| --- | --- | --- |
| Chromium desktop (latest stable) | Required | Primary correctness and performance target |
| Tauri on Windows (`WebView2`) | Required | Must validate input, IME, clipboard, resize, and scroll behavior |
| Tauri on macOS (`WKWebView`) | Required | Composition and selection behavior are especially important |
| Tauri on Linux (`WebKitGTK` or shipped engine) | Required if shipped | Validate event ordering, resize, and IME candidate positioning |
| Safari/WebKit desktop (latest stable) | Required | `beforeinput`, composition, and selection behavior must be verified explicitly |
| Firefox desktop (latest stable) | Supported | Best-effort parity for the core editing path; browser-specific fallbacks allowed |
| Mobile browsers | Out of scope for v1 | No commitment in this rewrite |

Feature policy:

- ordinary typing, navigation, selection, clipboard, and IME must work on all required targets
- browser-specific event quirks are handled in the input adapter layer, not leaked into core semantics
- if a browser lacks a preferred API, the fallback path must be explicitly documented and tested

### Browser/API Compatibility Matrix

The rewrite depends on a small set of browser APIs that need explicit fallback policy.

| API | Preferred use | Required targets | Fallback | Notes |
| --- | --- | --- | --- | --- |
| `beforeinput` | primary text insertion/deletion semantics | Chromium, Safari/WebKit, Tauri shells | degrade to `input` + mirrored-buffer diff when event detail is insufficient | do not route printable text through `keydown` as the primary path |
| composition events | IME lifecycle | Chromium, Safari/WebKit, Tauri shells | none; composition support is mandatory on required targets | browser-specific ordering stays in input adapter code |
| Clipboard API | read/write clipboard text | Chromium, Safari/WebKit, Tauri shells | browser command fallback where direct async clipboard access is unavailable | never persist clipboard contents |
| `ResizeObserver` | viewport resize detection | all required targets | window resize + measured polling as last resort | must stay off the hot path |
| `requestIdleCallback` | width-scan and non-urgent background work | opportunistic | short `setTimeout` slices | correctness must not depend on idle support |

Rules:

- if a target lacks a preferred API, the fallback must preserve correctness first and performance second
- missing fallback coverage on a required target blocks rollout
- browser compatibility belongs in the RFC because the input strategy depends on it

---

## Accessibility

This rewrite must preserve editor accessibility parity for the supported desktop baseline.

Accessibility requirements for v1:

- the hidden input surface remains focusable and browser-addressable for IME, accessibility tooling, and keyboard interaction
- editor focus semantics remain explicit: the host focuses the editor session, and the session focuses the hidden input surface
- keyboard-only navigation, selection extension, clipboard operations, and save shortcuts must continue to work without pointer interaction
- screen-reader behavior must remain at least as good as the current editor on required targets; regressions in basic focus or text input behavior block rollout
- selection and cursor overlays are visual affordances only; semantic input state still comes from the hidden input surface and the core selection model

Non-goals for v1 accessibility work:

- perfect screen-reader narration for every visual decoration layer
- mobile accessibility parity

Validation policy:

- accessibility checks are part of manual browser validation, not an implied side effect of unit coverage
- any hidden-textarea or focus-management change must be revalidated on Chromium, Safari/WebKit, and shipped Tauri shells

---

## Success Criteria

The rewrite is successful when all of the following are true.

### Architecture Success Criteria

- All text mutations go through one non-reactive core API
- The visible editor rows are not Solid components participating in the hot path
- The core can be tested without a browser and without Solid
- The view can be tested with a fake core and fake scheduler
- Async syntax results carry a version and are discardable

### Performance Success Criteria

- Single-character insertion in a normal file updates the model synchronously and paints in the next frame without waiting for syntax work
- Single-character insertion does not trigger full visible subtree rerender semantics
- Newline insertion invalidates only the necessary row range, overlays, gutter widths if needed, and viewport metadata
- Holding arrow keys does not create reactive cascades proportional to visible row count
- Typing remains responsive in very large files with stale decorations temporarily tolerated

### Simplicity Success Criteria

- No highlight offset mapping pipeline in the rewrite path
- No per-character keybinding registration for printable text
- No editor business logic inside the top-level Solid view component
- No view restoration logic embedded in the hot render layer

---

## Core Runtime Model

The new editor is organized around three loops.

### 1. Hot Synchronous Loop

This is the path that must stay small.

```text
event -> normalize -> dispatch(transaction) -> mutate model -> mark dirty -> schedule frame
```

This loop owns:

- text edits
- cursor movement
- selection changes
- undo/redo
- scroll state updates
- viewport state changes caused by input

This loop does not own:

- syntax recompute
- minimap repaint
- persistence writes
- diagnostics

### 2. Paint Loop

```text
RAF -> flush dirty text rows -> flush gutter -> flush overlay -> commit view state
```

This loop owns:

- row pool updates
- DOM text node updates
- line HTML updates
- cursor position paint
- selection rectangles
- scroll syncing if needed

### 3. Async Enrichment Loop

```text
docVersion changed -> worker tasks -> result(versioned) -> discard or apply -> mark dirty lines -> schedule frame
```

This loop owns:

- syntax highlights
- diagnostics
- fold snapshots
- minimap tokens
- bracket metadata if async

The editor stays correct if this loop is delayed.

---

## Target Architecture

### Overview

```text
Solid shell
  -> createSolidEditorHost
  -> makeEditorSession
      -> makeEditorCore
      -> makeEditorView
      -> makeInputController
      -> makeFrameScheduler
      -> makeDecorationStore
      -> makeWorkerBridge
```

### Boundary Diagram

```text
┌────────────────────────────────────────────────────────────────────┐
│                         Solid Shell Layer                         │
│                                                                    │
│  - mount/unmount                                                   │
│  - slow prop watching                                              │
│  - host callbacks                                                  │
│  - file switch orchestration                                       │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                         Editor Session Layer                      │
│                                                                    │
│  makeEditorSession                                                │
│  - wires core, view, input, scheduler, worker bridge              │
└───────────────┬───────────────────┬───────────────────┬────────────┘
                │                   │                   │
                ▼                   ▼                   ▼
┌────────────────────┐   ┌────────────────────┐   ┌──────────────────┐
│   EditorCore       │   │   EditorView       │   │ InputController  │
│                    │   │                    │   │                  │
│ - document model   │   │ - row pool         │   │ - beforeinput    │
│ - selections       │   │ - text layer       │   │ - keydown        │
│ - viewport         │   │ - overlay layer    │   │ - composition    │
│ - dirty flags      │   │ - gutter layer     │   │ - pointer drag   │
│ - history          │   │ - textarea         │   │ - clipboard      │
└──────────┬─────────┘   └──────────┬─────────┘   └────────┬─────────┘
           │                        │                      │
           └──────────────┬─────────┴──────────────┬───────┘
                          ▼                        ▼
                 ┌────────────────┐       ┌────────────────────┐
                 │ FrameScheduler │       │  DecorationStore   │
                 │                │       │                    │
                 │ - coalesces    │       │ - versioned async  │
                 │ - RAF flush     │       │ - line decorations │
                 └────────────────┘       └─────────┬──────────┘
                                                    ▼
                                           ┌──────────────────┐
                                           │  Worker Bridge   │
                                           │                  │
                                           │ - tree-sitter    │
                                           │ - minimap feed   │
                                           │ - folds/errors   │
                                           └──────────────────┘
```

### What Solid Owns in the New Model

Solid should own only:

- mounting the editor host element
- destroying the session on unmount
- watching slow-changing props and forwarding them imperatively
- passing new file identity/content to the session
- forwarding host callbacks like save, edit-blocked, scroll persistence

Solid must not own:

- document text mutation state
- visible line row identity
- selection rectangle geometry
- syntax segment computation for visible rows
- per-keystroke scheduler behavior

### Authority Boundaries

The rewrite needs explicit authority boundaries so bugs have obvious owners.

| Concern | Authoritative owner | Notes |
| --- | --- | --- |
| document text, piece table, line starts, line IDs, history | `EditorCore` | the runtime source of truth |
| selections, cursor, preferred column, composition session | `EditorCore` | semantic state lives in core, not in the textarea |
| viewport state (`scrollTop`, `scrollLeft`, viewport size) | `EditorCore` | `EditorView` measures DOM state and reports it through `updateViewport` |
| row pooling, DOM nodes, pixel geometry, hit testing | `EditorView` | mechanical complexity lives here, but not document semantics |
| mirrored input buffer DOM value/selection | `InputController` | browser interop surface only; derived from core state |
| syntax, diagnostics, bracket metadata storage | `DecorationStore` behind `EditorCore.applyDecorations` | worker never writes decorations directly into the view |
| fold open/closed interactive state | `EditorCore` | user intent is core state |
| fold projection into visible rows | `DisplayModel` | v1 scope is fold projection only |
| scroll anchoring decision | `EditorCore` emits hint, `FrameScheduler` applies it, `EditorView` performs DOM scroll write | one owner per step |
| persistence timing and save triggers | host adapter | editor exposes state, host decides when to persist |

If ownership is ambiguous, the design is not finished.

---

## Subsystem Design

## 1. Editor Session

`makeEditorSession` is the integration object for the editor runtime.

It is responsible for wiring together:

- `makeEditorCore`
- `makeEditorView`
- `makeInputController`
- `makeFrameScheduler`
- `makeDecorationStore`
- `makeWorkerBridge`

Responsibilities:

- initialize runtime state from a document snapshot
- attach/detach DOM
- bridge core dirty events to scheduler
- bridge input events to core transactions
- bridge worker results to decoration updates
- expose host-facing methods like `setTheme`, `setFont`, `replaceDocument`, `restoreViewState`

Non-responsibilities:

- line rendering decisions
- transaction semantics
- syntax processing logic

### Proposed Session API

```ts
type EditorSession = {
	attach(root: HTMLElement): void
	detach(): void
	destroy(): void
	setDocument(input: EditorDocumentInput): void
	setEditable(next: boolean): void
	setTheme(theme: EditorThemeInput): void
	setFont(font: EditorFontInput): void
	setTabSize(tabSize: number): void
	restoreViewState(state: PersistedEditorViewState | undefined): void
	getViewState(): PersistedEditorViewState
	getCore(): EditorCore
}
```

---

## 2. EditorCore

`makeEditorCore` is the single source of truth for hot editor state.

### Responsibilities

- own document state
- own line index and line IDs
- own cursor and selection state
- own viewport state
- own history state
- own invalidation state
- own mutation normalization and dispatch
- own version counters

### Non-Responsibilities

- direct DOM writes
- framework reactivity
- worker lifecycle
- persistence timing

### State Groups

#### Hot State

Changes frequently during interaction.

- piece table snapshot or equivalent mutable document representation
- line starts
- line IDs and line metadata
- primary cursor
- selections
- preferred x column for vertical movement
- viewport scroll state
- dirty ranges
- pending composition state

#### Warm State

Changes on file switches or view configuration changes.

- tab size
- editable mode
- cursor mode
- document identity

DOM-derived metrics do not belong in the core.

The core may store logical configuration that influences measurement, but measured values such as `charWidth`, `lineHeight`, and container geometry belong to the display/layout runtime.

#### Async State

Produced externally and applied version-safely.

- syntax highlight segments by line ID
- diagnostics by line ID
- bracket metadata by line ID
- fold ranges / fold state
- minimap summary data

### Version Counters

The core tracks separate versions to keep invalidation precise and observable.

- `docVersion`
  - increments on every text mutation
- `structureVersion`
  - increments when line count or line ordering changes
- `selectionVersion`
  - increments on selection/cursor changes
- `viewportVersion`
  - increments on scroll/size/visible range changes
- `decorationVersion`
  - increments when async decoration data is applied
- `themeVersion`
  - increments on theme/font-affecting render changes

### Document Identity

`docVersion` alone is not enough to identify async results safely.

The runtime also needs an explicit document identity tuple.

```ts
type DocumentIdentity = {
	sessionId: string
	documentKey: string
	documentIncarnation: number
}
```

Rules:

- `sessionId` is unique per editor session instance
- `documentKey` is the stable host-level identity used for persistence and shell coordination
- `documentIncarnation` increments whenever a new document instance replaces the current one in-process
- async worker results must match `sessionId`, `documentKey`, `documentIncarnation`, and `docVersion`
- persisted editor state is keyed by `documentKey`, not by `sessionId`

### Dirty Flags

The core emits a compact dirty payload after every mutation.

```ts
type EditorDirtyState = {
	identity: DocumentIdentity
	docVersion: number
	decorationVersion: number
	text: boolean
	gutter: boolean
	overlay: boolean
	viewport: boolean
	fullMeasure: boolean
	lineRange: { start: number; end: number } | null
	decorationLineIds: number[] | null
	scrollAnchor: ScrollAnchorHint | null
}
```

Guidelines:

- text edits mark the edited line range dirty
- cursor-only movement marks overlay dirty and may mark viewport dirty if scrolling required
- gutter width changes mark gutter dirty
- theme/font changes mark full text repaint and full measure
- decoration updates mark only affected line IDs dirty
- structural edits above the viewport may set `scrollAnchor` so the scheduler can preserve visible content

### Dirty Accumulator Contract

Dirty state must accumulate across multiple mutations before one RAF flush.

There is no “latest dirty wins” behavior.

Recommended model:

- the core owns a pending dirty accumulator
- every `dispatch`, `updateViewport`, and `applyDecorations` call merges into that accumulator
- the scheduler consumes the accumulator at flush time against the latest core snapshot

Merge rules:

- boolean dirty flags merge by logical OR
- `lineRange` merges by union in latest document coordinates
- `decorationLineIds` merges by set union
- `docVersion` becomes the latest current `docVersion`
- `decorationVersion` becomes the latest current `decorationVersion`
- `identity` must remain identical within one accumulator window; if identity changes, the accumulator resets to the new document
- `scrollAnchor` merges by:
  - additive delta only when every merged anchor is `kind: 'delta'`
  - falling back to `kind: 'anchor'` when structural edits or display remapping make delta anchoring unsafe

### Transactions

All synchronous, user-visible document and selection mutations are represented as transactions.

Viewport sync and async decorations are explicit non-transactional side-channels:

- `dispatch(transaction)` for interactive edits and navigation
- `updateViewport(input)` for scroll and resize sync
- `applyDecorations(snapshot)` for syntax, diagnostics, and other async enrichment

#### Transaction Types

```ts
type EditorTransaction =
	| { type: 'insert-text'; text: string }
	| { type: 'replace-range'; start: number; end: number; text: string }
	| { type: 'delete-backward'; byWord?: boolean }
	| { type: 'delete-forward'; byWord?: boolean }
	| { type: 'move-cursor'; direction: 'left' | 'right' | 'up' | 'down'; byWord?: boolean; extend?: boolean }
	| { type: 'move-cursor-home'; extend?: boolean; toDocument?: boolean }
	| { type: 'move-cursor-end'; extend?: boolean; toDocument?: boolean }
	| { type: 'move-cursor-page'; direction: 'up' | 'down'; visibleLines: number; extend?: boolean }
	| { type: 'set-cursor-from-point'; line: number; column: number; extend?: boolean }
	| { type: 'set-selection'; anchor: number; focus: number }
	| { type: 'select-all' }
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'set-fold-state'; startLineId: number; folded: boolean }
	| { type: 'replace-document'; document: EditorDocumentInput }
	| {
			type: 'replace-content'
			content: string
			remapHint?: OffsetMappingHint
	  }
```

The actual implementation can split command-level transactions from normalized mutation-level transactions, but the architecture must preserve the single entrypoint principle.

### Dispatch Rules

Pseudo code:

```ts
function dispatch(tx: EditorTransaction): DispatchResult {
	beginTrace(tx)
	const before = captureRollbackSnapshot()
	const draft = createDraft(before)

	try {
		clearDirty(draft)

		switch (tx.type) {
			case 'insert-text':
				applyInsert(draft, tx)
				break
			case 'replace-range':
				applyReplace(draft, tx)
				break
			case 'delete-backward':
				applyDeleteBackward(draft, tx)
				break
			case 'delete-forward':
				applyDeleteForward(draft, tx)
				break
			case 'move-cursor':
				applyCursorMove(draft, tx)
				break
			case 'move-cursor-home':
			case 'move-cursor-end':
			case 'move-cursor-page':
				applyCursorNavigation(draft, tx)
				break
			case 'set-cursor-from-point':
				applyPointSelection(draft, tx)
				break
			case 'set-selection':
			case 'select-all':
				applySelection(draft, tx)
				break
			case 'undo':
			case 'redo':
				applyHistory(draft, tx)
				break
			case 'set-fold-state':
				applyFoldToggle(draft, tx)
				break
			case 'replace-document':
				applyDocumentReplacement(draft, tx.document)
				break
			case 'replace-content':
				applyContentReplacement(draft, tx)
				break
		}

		const dirty = finalizeDirty(draft)
		commitDraft(draft)
		emitChange(dirty)
		endTrace(tx)
		return { ok: true, dirty }
	} catch (error) {
		restoreRollbackSnapshot(before)
		logDispatchFailure(tx, error)
		endTrace(tx, { failed: true })
		return { ok: false, error }
	}
}
```

Dispatch handlers should never leave the editor in a partially mutated state.

Preferred implementation strategy:

- compute changes against a draft or rollback snapshot
- commit atomically on success
- restore the last known good state on failure

This is non-negotiable because text corruption bugs are much worse than transient rendering bugs.

### Chosen v1 Transaction Model

v1 uses a staged draft with copy-on-write for modified structures.

Rules:

- live core state is never mutated in place during handler execution
- `dispatch` creates a `CoreDraft` seeded from the current committed state
- modified structures are copied on write into the draft only when touched
- handlers mutate draft-local structures only
- commit is an atomic swap of the draft root references into the live core state
- rollback means dropping the draft and keeping the last committed state

Implications:

- this is not a full persistent-data-structure rewrite
- this is not a mutation-in-place model with ad hoc cleanup on failure
- piece-table snapshots and other already-immutable structures can be reused directly inside the staged commit model

### Viewport Fast Path

Scroll and resize traffic should not pay the full document-transaction cost.

Recommended API:

```ts
core.updateViewport({
	scrollTop,
	scrollLeft,
	viewportWidth,
	viewportHeight,
})
```

Rules:

- `updateViewport` is non-undoable
- `updateViewport` does not allocate history entries
- `updateViewport` does not require rollback snapshots unless it triggers structural remapping logic
- `updateViewport` merges directly into the dirty accumulator and schedules a cheap flush path

### EditorCore Invariants

- document text is authoritative in the core, not the view
- line starts and line IDs are updated atomically for each edit
- every text mutation increments `docVersion`
- every applied decoration snapshot must match the active document identity and `docVersion`
- line IDs are monotonically increasing and never recycled, including undo/redo
- dirty state is cleared only after the view flushes
- a selection can never point outside document bounds
- the core never mutates DOM

---

## 3. Document Model

The document model should keep the existing strengths:

- piece-table-based text mutation
- fast offset-based editing
- line starts for cursor math
- line IDs for stable identity

### Recommended Structure

```ts
type LineRecord = {
	id: number
	start: number
	length: number
	textLength: number
	revision: number
}

type DocumentModel = {
	pieceTable: PieceTableSnapshot
	length: number
	lineStarts: number[]
	lineIds: number[]
	lineIndexById: Map<number, number>
	lineRecordsById: Map<number, LineRecord>
	nextLineId: number
}
```

### Line ID Allocation Policy

`nextLineId` is monotonic.

Rules:

- line IDs are never recycled
- undo/redo restores text structure, not historical line IDs
- if undo resurrects previously deleted logical lines, those lines receive fresh IDs
- stale decoration entries keyed by retired IDs are safe to evict lazily because those IDs are never reused

### Why Keep Line IDs

Line IDs solve several problems cleanly:

- stable row reuse during line shifts
- stable decoration identity for unaffected lines across edits
- stable fold identity at the line level
- stable visible cache keys

### Edit Semantics

#### Insert Inside a Line

- update piece table
- update current line text/length/textLength/revision
- shift `start` for subsequent line records
- keep unaffected line IDs stable
- mark edited line dirty

#### Insert Newline

- split one line into two line records
- preserve original line ID for the first logical line
- allocate new line ID for inserted continuation/new line
- shift subsequent starts
- mark from edited line through affected visible range dirty

#### Delete Across Lines

- merge or shrink affected lines
- preserve one survivor line ID for the merged result
- retire deleted line IDs
- shift subsequent starts
- mark merged line and affected range dirty

#### Replace Document

- rebuild line index
- rebuild line IDs
- reset history merge session
- invalidate all decorations
- full repaint

#### Replace Content

- preserve file identity
- replace the underlying piece table/content for the same document
- preserve cursor and scroll position best-effort using `remapHint` when provided
- clamp cursor and selections if no hint is available
- invalidate decorations and request fresh async snapshots

### Replacement Semantics

`replace-document` and `replace-content` are intentionally different operations.

- `replace-document`
  - new file identity or full editor reset
  - host may restore persisted scroll/cursor/selections
  - line IDs are rebuilt from scratch

- `replace-content`
  - same file identity, external content rewrite
  - editor tries to preserve cursor/selection/scroll position using offset mapping hints
  - if no mapping hint exists, preserve by nearest valid offset and viewport anchor best-effort

### Authoritative Runtime Source of Truth

The runtime must collapse the current dual-source host model into one authoritative document model.

Rules:

- inside the runtime, `EditorCore` owns the authoritative piece-table-backed document model
- host `content` and host `pieceTable` are migration-era input formats only
- the Solid wrapper normalizes host inputs into one `EditorDocumentInput` before creating or replacing the document in the session
- once a document is loaded into the session, per-keystroke edits do not flow back through host `content` or host `pieceTable` props to stay correct
- external host-driven rewrites must use explicit `replace-document` or `replace-content` semantics rather than silently changing two host inputs independently

Migration rule:

- during coexistence, if both host `content` and host `pieceTable` are supplied, they must describe the same document bytes; mismatches are treated as adapter bugs

### Line-ID Consequences

Line IDs remain the right rendering identity, but they are not general persistence keys.

Rules:

- scroll, cursor, and selection persistence remain offset/position based, not line-ID based
- stale decoration reuse is safe because retired line IDs are never reused
- user fold-open state can follow surviving line IDs within the same document incarnation
- `replace-document` invalidates line-ID-keyed metadata by design
- undo/redo may recreate logically similar lines with fresh IDs; future metadata that needs semantic resurrection must use a different identity strategy than line ID alone

### DisplayModel Boundary

The runtime needs a small display-model boundary even in v1.

`DocumentModel` owns the logical document.
`DisplayModel` owns how that document is projected into visible rows.

v1 `DisplayModel` responsibilities:

- display-to-document line mapping
- document-to-display line mapping
- fold projection

Not in the v1 `DisplayModel` contract:

- soft wrap
- long-line slicing
- any projection that changes horizontal text geometry

The view should read row projection from `DisplayModel`, not reimplement fold-aware mapping itself.

Long-line rendering remains a view concern in v1. If a later rewrite wants a broader `DisplayModel`, that should be a new RFC rather than an implicit expansion of this one.

### Line Revision Policy

Each line record should carry a revision counter.

This gives the renderer a precise cache key:

- if `lineId` same and `revision` same, text content is unchanged
- line index changes alone do not force text rerender

---

## 4. Selection and Cursor Model

Selections stay in the core.

### Data Shape

```ts
type SelectionRange = {
	anchor: number
	focus: number
}

type CursorModel = {
	selections: SelectionRange[]
	preferredColumn: number | null
	mode: 'regular' | 'terminal'
	composition: CompositionState | null
}
```

### Rules

- the first selection is the primary selection for cursor painting and input anchoring
- v1 rewrite scope is single selection only for editing semantics
- cursor movement updates `preferredColumn` for vertical navigation
- selection state must be independent from decorations

### v1 Selection Scope

The runtime keeps `selections: SelectionRange[]` as the data shape because it is future-proof and history-friendly.

However, the v1 rewrite explicitly scopes editing semantics to a single active selection.

v1 invariants:

- `selections.length === 1` on all user-editing paths
- insert/delete/replace transactions operate on the primary selection only
- multi-cursor editing is deferred until after the runtime rewrite stabilizes

If multi-cursor editing is added later, text-edit transactions must apply ranges in reverse-offset order and commit atomically.

### Selection State Machine

The selection model should be explicit enough to reason about legal transitions.

States:

- `collapsed`
- `range`
- `dragging`

Legal transitions:

- `collapsed -> range` via shift-navigation, pointer drag, or explicit selection transaction
- `range -> collapsed` via directional movement without extend, insert-text, replace-range, or explicit collapse
- `collapsed -> dragging` via pointer down + drag
- `range -> dragging` via pointer down on selection edge or new drag gesture
- `dragging -> collapsed` or `dragging -> range` on pointer up depending on final anchor/focus

Illegal transitions:

- selection state changes driven directly by decoration updates
- hidden textarea selection becoming the authoritative selection state

Invariant:

- selection state is committed through core transactions only

### Coordinate Model

The rewrite must standardize coordinates up front.

Internal editor coordinates:

- document offsets are UTF-16 code unit offsets into the full document string model
- `line` is a zero-based logical document line index
- `column` is a zero-based UTF-16 code unit offset within the logical line text

Display coordinates:

- visual columns are derived from logical columns plus tab expansion
- x coordinates are pixel positions derived from visual columns under the v1 monospace invariant

Mirrored input-surface coordinates:

- textarea offsets are UTF-16 code unit offsets within the mirrored input buffer only
- textarea offsets are never treated as document offsets without explicit translation

External boundary rule:

- worker or parser coordinate systems that use different units must be translated at the adapter boundary
- core, selection, pointer, overlay, and history code must all agree on the internal coordinate model above

### Overlay Ownership

The cursor and selection overlay should be a single imperative layer.

It should render from:

- current selections
- visible lines
- line metrics
- viewport state

It should not read from Solid.

### Initial Implementation Choice

Use imperative DOM overlays in v1.

Reasoning:

- simpler than canvas
- easier to inspect and debug
- enough for current feature set
- easy to migrate to canvas later if profiling proves necessary

Canvas overlay remains a possible later optimization, not the starting point.

---

## 5. InputController

`makeInputController` owns event interpretation.

It must be small, predictable, and browser-native.

### Responsibilities

- focus management for the hidden textarea/input surface
- `keydown` handling for non-text commands
- `beforeinput` and `input` handling for text insertion and deletion semantics
- composition handling for IME
- clipboard interactions
- pointer-based cursor placement and drag selection once the new view metrics API is available

### Non-Responsibilities

- direct model mutation without the core
- DOM painting
- highlight updates

### Event Policy

#### `keydown`

Use for:

- navigation commands
- undo/redo
- save
- select all
- cut/copy/paste command routing
- backspace/delete when browser input semantics are insufficient or need explicit normalization

Do not use `keydown` for ordinary printable text insertion.

#### `beforeinput` / `input`

Use for:

- inserted text
- line breaks
- paste text
- composition text
- browser-originated deletion semantics

This restores the browser to the role it is good at: telling us what text input actually happened.

#### `compositionstart` / `compositionupdate` / `compositionend`

Use to handle IME correctly.

Rules:

- composition text is a provisional editing session
- the editor must not fight the browser during active composition
- provisional composition state stays in the core and paints through the normal text/overlay path

### Composition Reconciliation

Composition behavior must be explicit because browser event ordering is inconsistent across engines.

Recommended policy:

1. `compositionstart`
   - create a composition session in the core
   - capture the pre-composition selection/range and history anchor

2. During composition
   - apply provisional edits into the core whenever reliable text is available from `beforeinput`, `input`, or `compositionupdate`
   - treat these edits as composition-scoped replacements of the active composition range
   - do not create separate undo history entries for intermediate composition updates
   - render from core state, not from textarea content

3. `compositionend`
   - finalize the composition text in the core
   - collapse the provisional edit sequence into a single history entry
   - clear the composition session

4. Browser variance fallback
   - Safari and similar engines may emit unreliable intermediate composition text
   - when that happens, diff the mirrored input-surface buffer against the composition session and reconcile using the latest browser-provided text window

Undo policy:

- undo during an active composition should either cancel the composition session or be ignored until composition end
- once composition ends, the entire composition resolves as one undo step

### Composition State Machine

Composition behavior must be legal-state driven, not a pile of event-conditionals.

States:

- `idle`
- `composing`
- `committing`
- `cancelled`

Legal transitions:

- `idle -> composing` on `compositionstart`
- `composing -> composing` on provisional updates from `beforeinput`, `input`, or `compositionupdate`
- `composing -> committing` on `compositionend`
- `composing -> cancelled` on explicit cancellation or unrecoverable browser reset
- `committing -> idle` after the final composed text is recorded as one history entry
- `cancelled -> idle` after provisional state is cleared

Illegal transitions:

- applying a normal text transaction as if composition were inactive while `composition` state is live
- leaving provisional composition ranges behind after `compositionend`
- accepting stale mirrored-buffer text after document identity changes

External-event rule:

- `replace-document` cancels active composition immediately
- `replace-content` during active composition either cancels composition or is rejected by policy; v1 should prefer cancellation over attempting to merge two concurrent authorities

### Document Replacement State Machine

Document replacement also needs explicit legal states.

States:

- `steady`
- `replacing-content`
- `replacing-document`

Legal transitions:

- `steady -> replacing-content -> steady`
- `steady -> replacing-document -> steady`

Rules:

- `replace-content` preserves `documentKey` and increments `docVersion`
- `replace-document` increments `documentIncarnation`, resets transient editor state, and invalidates line-ID-keyed metadata
- worker snapshots for the previous identity are discarded after either replacement path
- active composition is cancelled before either replacement path commits

### Hidden Textarea Synchronization

The hidden input surface is not a source of truth. It is a browser interoperability surface.

It exists for:

- IME candidate positioning
- reliable input event delivery
- accessibility hooks
- browser clipboard and selection behavior

Synchronization policy:

- the textarea mirrors a small window of text around the active cursor/composition range
- default mirror window should include the active line, capped to a bounded size
- if the line is too large, fall back to a bounded range around the cursor, such as `±64` to `±128` UTF-16 code units
- the mirrored window must always include the active selection or composition span
- textarea selection offsets mirror the active cursor/composition offsets within the mirrored buffer
- the mirrored buffer is updated synchronously after dispatch and before control returns to the browser event loop when required for IME correctness
- mirrored buffer offsets use UTF-16 code unit indexing, even if the external worker world uses another unit system

Positioning policy:

- the input surface is visually hidden but not detached from layout semantics needed by browsers
- it is positioned to the caret anchor so IME windows and accessibility affordances appear in the correct place

### Why Delete Printable Keybinding Registration

The current per-character registration model is complexity with no upside for ordinary text input.

Problems with the current approach:

- large registration surface
- browser text semantics are reimplemented
- IME path becomes harder
- text insertion correctness becomes more fragile

The new rule is simple:

- commands go through `keydown`
- text goes through native input events

### Clipboard Rules

- copy reads selected text from the core and writes to clipboard
- cut copies then dispatches a delete transaction
- paste reads clipboard text and dispatches an insert/replace transaction

### Pointer Rules

- pointer down resolves a line and column from view metrics
- the controller dispatches `set-cursor-from-point`
- drag selection dispatches selection updates using captured pointer events

Pointer hit testing depends on the new view measurement contract.

Implementation note:

- keyboard, clipboard, and composition work can land before the new pointer path
- if needed, pointer hit testing stays on the legacy measurement path until Phase 4
- the preferred end state is one measurement API owned by the imperative view

### Command Translation Boundary

`InputController` is not the command system.

Its job is:

- normalize browser events
- translate them into editor commands or direct text-input payloads
- forward those commands to command handlers that produce transactions

Recommended boundary:

- `InputController`: DOM events -> `EditorCommand`
- `CommandRouter`: `EditorCommand` -> `EditorTransaction`
- `EditorCore`: `EditorTransaction` -> state mutation

This keeps browser quirks out of command semantics.

### InputController Invariants

- never mutate the view directly
- never mutate decorations
- never call worker code directly
- every user-visible edit becomes a transaction

---

## 6. FrameScheduler

`makeFrameScheduler` is the only place that coordinates paint timing.

### Responsibilities

- coalesce repeated dirty notifications
- schedule RAF
- flush view updates in stable order
- optionally schedule non-urgent measurement or idle work

### Flush Order

Recommended order:

1. viewport metric sync if needed
2. gutter updates if needed
3. text row updates
4. overlay updates
5. post-flush hooks for persistence and benchmarks

### Why a Dedicated Scheduler

Without a dedicated scheduler, multiple subsystems will each try to be “smart” about when to repaint.

That causes:

- duplicate work
- uncertain order
- harder profiling
- hidden frame boundaries

### Suggested API

```ts
type FlushReceipt = {
	identity: DocumentIdentity
	docVersion: number
	rowsUpdated: number
	overlayUpdated: boolean
	gutterUpdated: boolean
	durationMicros: number
}

type FrameScheduler = {
	requestFlush(reason: FlushReason): void
	flushNow(): FlushReceipt | null
	destroy(): void
}
```

### Scroll Anchoring Policy

Structural edits must preserve visible content stability.

Recommended strategy:

- capture a viewport anchor before applying structural edits
- preferred anchor is the top visible surviving line ID plus pixel offset within the line
- if the edit is entirely above the viewport and fixed line height assumptions hold, use the fast path:
  - `scrollAnchor = { kind: 'delta', deltaPx: lineDelta * lineHeight }`
- if folds or other structural mapping changes invalidate the fast path, recompute scroll from the surviving anchor line ID
- apply scroll anchoring before row flush so the viewport does not visibly jump

### Rules

- synchronous model mutation, asynchronous paint
- no subsystem schedules its own RAF for normal editor paint
- worker-driven updates also go through the same scheduler

---

## 7. EditorView

`makeEditorView` owns all DOM for the editor viewport.

### DOM Structure

Recommended structure:

```text
editor-root
  scroll-container
    content-spacer
    gutter-layer
    text-layer
    overlay-layer
  hidden-input-surface
```

The hidden input surface must remain browser-addressable.

It should be:

- visually hidden, not semantically removed
- positioned to the active caret anchor
- synchronized with a bounded mirror buffer from core state

### Row Pooling Strategy

Use a fixed pool of row elements sized to:

- visible row count
- plus vertical overscan

Recommended formula:

```ts
const overscanRows = Math.min(20, Math.max(8, Math.ceil(visibleRows / 2)))
const poolSize = Math.min(visibleRows + 2 * overscanRows, 200)
```

This is a starting policy, not dogma, but the pool size should be explicit and benchmarked rather than hand-wavy.

Each pooled row contains:

- gutter element
- text element

Row elements are recycled by moving them and retargeting them to line IDs.

### Measurement Contract

The imperative view must expose enough measurement information for both overlay geometry and pointer hit testing.

Minimum required metrics:

- `columnToX(lineId, column)`
- `xToColumn(lineId, x)`
- `lineFromClientY(clientY)`
- `getCaretRect(lineId, column)`

These methods must be tab-aware.

Tabs are not fixed-width characters.
They expand to tab stops using the current `tabSize`, so every overlay and pointer calculation must use the same metric helpers.

v1 geometry invariant:

- v1 is monospace-only
- a single measured advance width is assumed for non-tab glyph layout
- proportional fonts are out of scope for the rewrite and must not silently degrade correctness

Architecture rule:

- input, overlay, selection, gutter hit testing, and layout must all consume this one measurement API
- no subsystem-local geometry helpers should survive in the final runtime

Future-proofing rule:

- the measurement API must be designed as if folds and long-line rendering already exist
- call sites should target display rows and line IDs, not raw assumptions about 1:1 document-line rendering

### Row Cache Key

Each row tracks:

- `lineId`
- `lineRevision`
- `decorationRevision`
- `themeVersion`
- `renderMode`

If all values are unchanged, the row does not rerender its text HTML.

### Render Modes

#### Plain Text Fast Path

Use when a visible line has:

- no highlight segments
- no bracket color spans
- no special render overlay inside text layer

Render via `textContent`.

#### Decorated HTML Path

Use when a line has syntax or bracket decorations.

Render via cached HTML string and assign to `innerHTML` only when changed.

#### Long-Line Mode

Use only when a line exceeds a configured pathological threshold.

The normal editor should not be governed by long-line logic.

### Long-Line Mode

Long-line mode is a special case, not the default renderer.

Recommended first implementation:

- define `LONG_LINE_RENDER_THRESHOLD`
- if a visible line exceeds that threshold, render a horizontal slice instead of the full line
- compute the slice from scroll position and visible viewport width
- keep this code isolated in `LongLineRenderer`

This preserves simplicity for the common case.

### Gutter Rendering

The gutter should be part of the row pool, not a separately reactive component tree.

Responsibilities:

- line number text
- active line styling
- fold chevron / fold controls

### Overlay Rendering

The overlay layer owns:

- primary cursor
- block/beam cursor variants
- selection rectangles
- optional whitespace markers if retained

Overlay repaint should be independent from text repaint when possible.

### Scroll Ownership

The view owns scroll listeners and current viewport geometry.

The core owns the authoritative viewport state data.

The scheduler coordinates the two.

### Resize Handling

The view must observe container size changes.

Recommended policy:

- use `ResizeObserver` on the host or scroll container
- translate resize notifications into viewport-dirty scheduler requests
- coalesce resize-driven repaints through the same frame scheduler used for input-driven paint

### EditorView Invariants

- pooled rows are reused whenever possible
- text row rerenders are keyed by line identity and revisions, not framework rerenders
- overlay updates do not require full text rerender
- view does not interpret document semantics

---

## 8. Layout and Viewport Model

### First Principle

Layout must be simple enough that its cost is explainable.

### v1 Viewport Model

- fixed line height
- vertical virtualization only
- horizontal scrolling supported via content width and normal scroll container behavior
- gutter width derived from visible or total line count digit width

### Why Start With Vertical Virtualization Only

This cuts architecture complexity drastically.

Benefits:

- easier row pooling
- easier overlay math
- easier selection geometry
- easier correctness
- fewer invalidation dimensions

### Content Width Strategy

We still need a content width for horizontal scroll.

Recommended strategy:

1. measure visible lines immediately
2. keep `maxVisualColumnsSeen`
3. continue scanning the rest opportunistically using idle slices
4. update content width only when a larger width is found

This preserves the good idea behind the current width scan while removing reactive layout ownership from the render graph.

Idle scan policy:

- prefer `requestIdleCallback` when available
- use a timeout fallback so scans still progress on browsers with poor idle scheduling
- if `requestIdleCallback` is unavailable, fall back to short `setTimeout` slices
- scanning must pause or yield aggressively during active scrolling and typing bursts

### Metric Ownership

The layout runtime should own:

- line height
- char width
- tab size
- viewport width and height
- content width estimate
- visible line range
- tab-aware `columnToX` and `xToColumn` helpers

Theme/font changes mark layout dirty and trigger remeasurement.

These measured values belong to the display/layout runtime, not to `EditorCore`.

---

## 9. DecorationStore

`makeDecorationStore` owns async editor enrichment.

### Responsibilities

- accept syntax/diagnostic/fold results tagged with `docVersion`
- discard stale results
- store per-line decoration data keyed by line ID
- expose cheap line decoration lookups to the renderer
- emit affected line IDs on update

Decoration application is not an undoable transaction.

Canonical write path:

- external callers, including `WorkerBridge`, call `EditorCore.applyDecorations(snapshot)`
- `EditorCore.applyDecorations` validates identity and `docVersion`, then delegates storage/update work to `DecorationStore`
- `DecorationStore` is an internal collaborator, not a second public mutation entrypoint

### Why Decorations Must Be Versioned

Stale async results are inevitable.

The architecture must make them harmless.

Rule:

- if snapshot identity or `docVersion` does not match the active editor state, discard the snapshot

Authoritative semantics use current-version decorations only.

### Decoration Storage Shape

```ts
type LineDecorations = {
	highlightSegments: LineHighlightSegment[] | null
	errorSegments: LineHighlightSegment[] | null
	bracketDepths: Record<number, number> | null
	revision: number
}

type DecorationStore = {
	docVersion: number
	linesById: Map<number, LineDecorations>
	presentationFallbackById: Map<number, LineDecorations>
}
```

### Converting Async Results to Line-Keyed Data

The store can receive worker results as absolute ranges.

Application flow:

1. verify document identity and `docVersion`
2. use current document line starts and line IDs for that version
3. convert absolute highlight ranges to per-line segments
4. store segments under the matching line IDs
5. increment per-line decoration revision only where data changed
6. schedule repaint for affected visible rows

### Decoration Freshness Policy

Decorations are allowed to lag, but the lag budget should be explicit.

Recommended target budgets:

- files under `10k` lines: fresh decorations within `100ms`
- larger files: best-effort, but text paint must remain immediate regardless

Presentation fallback policy:

- stale decorations may be reused as a visual fallback only when the line ID survives and the line revision is unchanged
- edited lines whose revision changed must not reuse stale syntax spans as if they were authoritative
- diagnostics and folds should not use stale fallback if it could mislead interaction logic
- once fresh current-version decorations arrive, they replace fallback immediately

### What We Explicitly Remove

The rewrite path removes:

- optimistic highlight offset arrays
- old-to-new coordinate remapping for highlight reuse
- dirty highlight cache distinctions based on intersecting offsets
- edit-blocking highlight precompute gates

### Eventual Consistency Policy

After a text edit:

- text updates immediately
- existing decorations on unaffected lines remain
- edited/new lines can temporarily show stale visual fallback or empty decorations depending on line revision safety
- worker catches up and repaints those lines later

This is an acceptable and much simpler user experience.

---

## 10. Tree-Sitter and Worker Bridge

`makeWorkerBridge` coordinates async editor-related worker traffic.

### Responsibilities

- send incremental edits or full-content replacements to worker pipelines
- tag every request with document identity and `docVersion`
- coalesce edits for worker efficiency where useful
- apply only current-identity/current-version results

### Worker Contract

Every worker result must include:

- `DocumentIdentity`
- `docVersion`
- payload type
- payload data

### Recommended Worker Outputs

- syntax capture snapshot
- diagnostics snapshot
- fold snapshot
- minimap token summary

### Recommended Policy

- worker results never write to the DOM directly
- worker results never mutate the editor core directly except through an explicit snapshot-application transaction or store method
- worker lag is tolerated

### Incremental vs Full Parse

Keep incremental parsing if it is already valuable.

But its output should remain safely asynchronous and versioned.

The user must never pay immediate typing latency for the syntax worker to keep up.

---

## 11. Folds

Folds should be treated as async, structural decorations with local interactive state.

### Rules

- automatic fold ranges can come from the worker
- user fold-open/fold-close state lives in the core or fold manager
- edits that invalidate fold anchors mark folds stale until a fresh snapshot arrives

### Identity

Use stable line identity where possible for persisted user-toggled folds.

### Rendering

Fold state affects:

- gutter controls
- display-to-document line mapping
- viewport visible rows

Fold computations must stay out of the immediate text edit path except for the minimal invalidation needed to keep the viewport coherent.

---

## 12. Minimap

The minimap must become an observer, not a participant in the hot path.

### Rules

- minimap updates can lag behind text edits
- minimap has its own rendering cadence and internal batching
- minimap subscribes to `docVersion` and decoration summaries
- minimap work never blocks the editor frame scheduler

### Migration Rule

Do not let minimap complexity slow phase 1 through phase 4 of the rewrite.

Reconnect it after the main editor path is stable.

---

## 13. Persistence and Host Integration

Persistence logic currently leaks into the editor view runtime.

That should end.

### Persisted State

- scroll position
- cursor position
- selections
- visible content snapshot only if benchmarking proves it is meaningfully better than simpler restore paths

### New Ownership

The host adapter owns persistence timing.

The core exposes data.

The host decides when to save it.

### Rules

- persistence is debounced outside the hot path
- restore happens once per document activation, not continuously inside render orchestration
- editor view does not contain restore-specific effects

### Migration of Existing Persisted State

The rewrite must define what happens to existing host-managed state instead of leaving migration to guesswork.

Rules:

- persisted scroll, cursor, and selections continue to use host-level document identity and position-based data
- cached visible-content snapshots are opt-in and may be deleted if benchmarking does not justify them
- cached line starts are migration scaffolding only and must not become a required public contract
- host-side `contentVersion` style counters are replaced by explicit document identity plus `replace-content` or `replace-document` calls
- persisted data must never be keyed by transient `sessionId`

---

## 14. Solid Integration Contract

The new Solid wrapper should be tiny.

### Proposed Wrapper Shape

`createSolidEditorHost` or `Editor.tsx` should:

- create a session on mount
- attach it to a host element
- watch only slow-changing props
- call imperative setters on the session
- destroy the session on cleanup

### Wrapper Responsibilities

The Solid wrapper should react only to slow-changing host inputs:

- file identity change
- document replacement from external source
- font or theme change
- editable mode change
- worker or decoration source change

### Recommended Naming

- `make*` for non-reactive editor runtime modules
- `create*` only for Solid wrappers/adapters

This matches the repo’s Solid guidance and makes boundaries obvious.

---

## 15. File Layout Proposal

This is a proposed final shape, not a requirement to add every file on day one.

### New Runtime Structure

```text
packages/code-editor/src/
  core/
    makeEditorCore.ts
    document/
      DocumentModel.ts
      lineIndex.ts
      lineIds.ts
      transactions.ts
    history/
      HistoryModel.ts
      historyEntries.ts
    display/
      DisplayModel.ts
      displayMapping.ts
    selection/
      CursorModel.ts
      selectionMath.ts
    viewport/
      ViewportModel.ts
      layoutMetrics.ts
    decorations/
      makeDecorationStore.ts
      decorationSegments.ts
      bracketDepths.ts
    folds/
      FoldModel.ts
      foldMapping.ts
    types.ts

  view/
    makeEditorView.ts
    makeRowPool.ts
    TextLayer.ts
    GutterLayer.ts
    OverlayLayer.ts
    LongLineRenderer.ts
    lineHtml.ts
    textRuns.ts
    domMetrics.ts

  input/
    makeInputController.ts
    keymap.ts
    pointerSelection.ts
    composition.ts
    clipboard.ts

  commands/
    EditorCommand.ts
    CommandRouter.ts
    builtins.ts

  runtime/
    makeEditorSession.ts
    makeFrameScheduler.ts
    makeWorkerBridge.ts
    performance.ts

  solid/
    Editor.tsx
    createSolidEditorHost.ts
```

### Existing Files Likely to Shrink or Die

The following current files are likely to be removed or dramatically reduced after the rewrite:

- `packages/code-editor/src/editor/components/TextEditorView.tsx`
- `packages/code-editor/src/editor/components/EditorViewport.tsx`
- `packages/code-editor/src/editor/hooks/createTextEditorInput.ts`
- `packages/code-editor/src/editor/hooks/createTextEditorLayout.ts`
- `packages/code-editor/src/editor/hooks/createLineHighlights.ts`
- `packages/code-editor/src/editor/line/components/Lines.tsx`
- `packages/code-editor/src/editor/line/components/LineRow.tsx`
- `packages/code-editor/src/editor/selection/hooks/useSelectionRects.ts`
- `packages/code-editor/src/editor/selection/hooks/useWhitespaceMarkers.ts`

### Existing Code to Preserve or Rehome

- piece-table helpers from `@repo/utils`
- history concepts from `packages/code-editor/src/editor/history`
- line text run logic from `packages/code-editor/src/editor/line/utils/textRuns.tsx`
- cursor and line math utilities where still useful

### Public Package Boundary

The rewrite is the right time to narrow the package surface.

Final public exports should be intentionally small:

- stable editor component/session entrypoints
- stable public types
- stable theme helpers that are truly public

The package root should stop exporting internal hooks and implementation machinery by default.

Concretely, the final public surface should not include broad exports equivalent to `export * from './hooks'`.

### Host API Reduction

The public host-facing editor props/API should shrink aggressively during the rewrite.

Default disposition:

- delete `highlightOffset`
- delete `initialVisibleContent` unless benchmarks prove a real win
- delete `precomputedLineStarts` unless benchmarks prove a real win
- delete `documentVersion` in favor of explicit document identity/content replacement APIs
- delete `stats` unless there is a concrete public use case

The new host surface should prefer a small `EditorSessionInput` or equivalent config object over a wide migration-era prop bag.

### Host API Inventory and Migration Map

The current host surface is too wide to migrate safely by intuition.

| Current input | Disposition in rewrite |
| --- | --- |
| `document.filePath` | keep as part of `documentKey` input |
| `document.content` | migration-era bootstrap only; normalize into `EditorDocumentInput` |
| `document.pieceTable` | migration-era bootstrap only; normalize into `EditorDocumentInput` |
| `document.updatePieceTable` | delete from the steady-state public API |
| `document.isEditable` | keep as explicit session setter/input |
| `document.applyIncrementalEdit` | delete; worker bridge handles incremental worker traffic internally |
| `highlights`, `errors`, `brackets`, `folds` | replace with worker/decorations source input, not direct hot-path props |
| `highlightOffset` | delete |
| `treeSitterWorker` | keep only if the session still needs an injected worker bridge |
| `documentVersion`, `contentVersion` | replace with explicit `DocumentIdentity` plus replacement APIs |
| `initialScrollPosition`, `initialCursorPosition`, `initialSelections` | keep as restore inputs, possibly collapsed into one persisted-view-state object |
| `onScrollPositionChange`, `onCursorPositionChange`, `onSelectionsChange` | keep as debounced host callbacks or fold into one `onViewStateChange` callback |
| `initialVisibleContent`, `onCaptureVisibleContent`, `precomputedLineStarts` | delete unless benchmarks prove a real win |
| `registerEditorArea`, `activeScopes` | keep only if shell focus integration still requires them |
| `stats`, `previewBytes`, unrelated shell props | remove from the core editor surface |

Coexistence rule:

- every current consumer must be mapped deliberately to either keep, collapse, adapter-only, or delete before the legacy runtime is removed

---

## Migration Plan

This rewrite should be done as a controlled strangler migration with aggressive deletion at the end.

Temporary adapters are allowed only as migration scaffolding.

The final state must not keep two full editor runtimes alive.

## Phase 0 — Baseline, Rules, and Instrumentation

### Objective

Lock in the budgets and observability required to prove the rewrite helped.

### Work Items

- Define benchmark datasets
- Reuse the existing benchmark harness where possible instead of inventing a parallel one
- Add explicit timing marks for:
  - input event received
  - transaction start
  - transaction end
  - frame requested
  - frame flush start
  - frame flush end
- Record visible row update counts for common edit scenarios
- Record stale worker result discard counts
- Record long-line mode activations
- Add a deterministic canary edit trace that replays a fixed sequence of edits against fixture files

### Deliverables

- benchmark fixtures committed
- baseline measurements captured in a doc or script output
- lightweight runtime trace hooks in place
- canary replay script or harness committed

Recommended starting point:

- extend the existing editor benchmark setup and metrics utilities already in `packages/code-editor/src/editor/benchmarks/utils/`

### Acceptance Criteria

- we can measure keypress-to-paint before refactor work starts
- we can compare old and new paths with the same datasets

## Phase 1 — Carve Out `EditorCore`

### Objective

Move document, selection, history, viewport, and dirty-state ownership into a non-reactive core.

### Work Items

- Create `makeEditorCore`
- Move line starts, line IDs, and document edit logic out of `CursorContext`
- Move history application to core-owned transactions
- Expose core getters for:
  - line count
  - line index by ID
  - line ID by index
  - line text by index or ID
  - offset/position conversions
  - selections and cursor
- Define dirty-state emission contract

### Temporary Adapter Allowed

- existing Solid runtime may read from `EditorCore` through an adapter while view rewrite is still in progress

### Acceptance Criteria

- editor document edits can be exercised in tests without Solid
- a text transaction updates line IDs and line starts atomically
- selection and cursor movement work through the core only

## Phase 2 — Introduce `FrameScheduler`

### Objective

Make paint coordination explicit before replacing the view.

### Work Items

- Create `makeFrameScheduler`
- Route dirty notifications through scheduler
- Add a temporary no-op or adapter flush target if the imperative view is not ready yet

### Acceptance Criteria

- all repaint requests pass through one scheduler
- scheduler can be tested independently with fake view callbacks

## Phase 3 — Replace Input Path

### Objective

Remove `createTextEditorInput` from the hot path and replace it with `makeInputController`.

### Work Items

- Implement `keydown` command routing
- Implement native text input via `beforeinput` and `input`
- Implement clipboard routing
- Implement IME composition handling
- Delete printable character keybinding registration from the text path

Pointer note:

- Phase 3 covers keyboard, clipboard, and composition semantics
- pointer hit testing moves in Phase 4 with the new view measurement API unless a temporary adapter proves necessary

### Acceptance Criteria

- ordinary typing does not depend on command registration for characters
- navigation and command shortcuts still work
- IME composition works for the supported browser matrix defined in this RFC

## Phase 4 — Replace View with Row Pool

### Objective

Introduce `makeEditorView` with pooled rows and imperative DOM updates.

### Work Items

- Create host DOM structure
- Implement scroll container integration
- Implement vertical row pool
- Implement gutter rendering in pooled rows
- Implement text rendering fast paths
- Implement overlay layer for cursor and selection
- Implement view measurement API for pointer hit testing and tab-aware geometry
- Implement pointer-based cursor placement and drag selection on the new measurement path
- Implement resize handling via `ResizeObserver`
- Implement scroll anchoring for structural edits above the viewport

### Acceptance Criteria

- visible rows are not Solid components in the hot path
- single-character insert updates only the necessary rows and overlays
- scrolling recycles rows instead of remounting component subtrees

## Phase 5 — Rebuild Decoration Pipeline

### Objective

Replace `createLineHighlights` and optimistic offsets with a versioned decoration store.

### Work Items

- Create `makeDecorationStore`
- Convert worker results to line-ID-keyed decoration data
- Apply only matching-version snapshots
- Mark affected lines dirty and repaint
- Delete optimistic highlight offset path from the rewrite runtime

### Acceptance Criteria

- decorations can lag while text remains instant
- stale snapshots are discarded safely
- unaffected lines keep stable decorations across edits where line IDs survive

## Phase 6 — Folds, Width Scan, Long-Line Mode

### Objective

Reconnect structural and layout features after the core runtime is stable.

### Work Items

- Rebuild fold mapping around the new core/view contract
- Reimplement content width scan outside Solid
- Add isolated long-line mode
- Ensure gutter and viewport work with fold state
- Use `requestIdleCallback` with timeout fallback for width scans where available

### Acceptance Criteria

- common files work with simple vertical virtualization
- long lines do not force the entire editor into a 2D reactive model

## Phase 7 — Reconnect Minimap and Persistence

### Objective

Attach slower observers after the main editor path is proven.

### Work Items

- reconnect minimap as async observer
- reconnect scroll/cursor/selection persistence in host adapter
- reconnect any visible content snapshot mechanism only if benchmarking proves it beats simpler restore paths
- validate tab, pane, and app-shell state preservation expectations alongside raw editor persistence

### Acceptance Criteria

- minimap does not affect typing responsiveness
- persistence logic is outside the hot path

## Phase 8 — Delete Legacy Pipeline

### Objective

Remove the old runtime completely.

### Work Items

- delete legacy view orchestration files
- delete legacy line-level hooks made obsolete by imperative runtime
- delete highlight offset types and adaptation paths if no longer used anywhere
- delete migration adapters

### Acceptance Criteria

- one editor runtime remains
- the hot path is understandable without referencing Solid internals

---

## Benchmarks and Acceptance Criteria

The rewrite should be evaluated against representative datasets.

### Benchmark Datasets

#### Small File

- under 500 lines
- common TypeScript file
- moderate highlights

#### Medium File

- 5,000 to 20,000 lines
- realistic application source file or generated JSON

#### Large File

- 100,000+ lines
- syntax highlighting enabled where meaningful

#### Highlight-Heavy File

- dense syntax captures
- diagnostics present
- bracket depth activity present

#### Long-Line File

- lines above threshold
- mixed normal and pathological rows

### Scenarios

- type one character in the middle of file
- insert newline in the middle of visible range
- hold arrow key down
- drag mouse selection across visible rows
- paste 100 lines
- undo repeated edits
- switch files and restore scroll/cursor
- receive syntax snapshot while typing

### Metrics

- keydown to transaction start
- transaction duration
- transaction end to frame request
- frame flush duration
- total input-to-paint latency
- visible rows updated per edit
- overlay update duration
- stale worker result discard count
- long-line mode frequency
- memory usage of line HTML cache

### Target Budgets

These are target budgets, not hard guarantees for every machine.

| Scenario | Target |
| --- | --- |
| Normal single-char insert | next-frame paint without worker dependency |
| Normal newline insert | only affected rows and overlays repaint |
| Arrow navigation | overlay-only or minimal text repaint |
| Syntax worker lag | no typing stall |
| Large file open | no framework-scale row explosion |

### Memory Budgets

Latency budgets are not enough.

Initial memory budgets for v1:

- row pool: hard cap of `200` pooled rows per active editor
- line HTML cache: soft cap of `4MB`, hard cap of `8MB`, LRU eviction by estimated UTF-16 string bytes
- presentation fallback decoration cache: soft cap of `2MB` or `1000` lines, whichever comes first
- mirrored input buffer: bounded small window, normally under `256` UTF-16 code units unless composition requires more

Authoritative current-version decoration storage may exceed the fallback cache budget for the active document, but it must be measured and reported. If large files push it beyond acceptable levels, the implementation should degrade toward chunked or visible-window-biased decoration retention rather than unbounded growth.

### Architectural Acceptance Checks

- typing path does not call decoration offset remapping
- typing path does not require Solid line rerenders
- printable text path does not depend on per-char keybindings
- async snapshots can be dropped without correctness bugs

---

## Testing Strategy

Testing should mirror the new architecture boundaries.

### Unit Tests

Test the core without the DOM:

- insert/delete/replace transactions
- line ID stability
- line revision changes
- cursor movement
- selection bounds
- undo/redo
- viewport visible range math
- fold mapping logic
- decoration snapshot application and stale discard

### View Runtime Tests

Test the imperative view with a fake core:

- row pool reuse
- text row updates only when cache keys change
- overlay updates on selection changes
- gutter width updates when line digits change
- long-line mode activation

### Integration Tests

Test the runtime end-to-end in browser mode:

- typing text appears immediately
- newline updates visible rows correctly
- arrow movement updates cursor correctly
- paste and undo/redo work
- syntax updates repaint affected lines only

### Manual Browser Validation

Critical manual passes should include:

- IME composition
- clipboard behavior across browsers
- large file scrolling
- long-line behavior
- selection drag edge cases
- fold interactions

---

## Observability

The rewrite should make the editor easier to profile.

### Required Signals

- transaction type counts
- transaction durations
- frame flush durations
- flush receipts emitted by the scheduler/view boundary
- number of rows repainted per frame
- number of overlay rects painted
- decoration apply durations
- stale snapshot discard counts

### Suggested Trace Labels

- `editor.tx.insert`
- `editor.tx.delete`
- `editor.tx.move`
- `editor.frame.flush`
- `editor.view.text.flush`
- `editor.view.overlay.flush`
- `editor.decorations.apply`
- `editor.worker.discard`

### Debug Overlay Option

Consider a development-only overlay that shows:

- visible rows
- repainted rows this frame
- current `docVersion`
- current `decorationVersion`
- whether long-line mode is active

This is optional but useful during migration.

---

## Rollout and Deletion Plan

### Rollout Philosophy

Do not keep two architectures longer than necessary.

Temporary side-by-side scaffolding is allowed only to land the rewrite safely.

### Suggested Landing Strategy

1. land core and scheduler behind internal adapter scaffolding
2. land new input path
3. land new view path
4. land new decoration path
5. reconnect observers
6. delete old runtime immediately after parity

### Required Deletions After Landing

- old top-level editor orchestration runtime
- line-level reactive rendering hooks no longer needed
- optimistic highlight offset machinery
- temporary adapters between old and new runtime

### Rollback and Kill Switch

The rewrite needs an explicit rollback path while both runtimes coexist.

Required policy:

- gate the new runtime behind an internal feature flag such as `editor_runtime_v2`
- the runtime switch lives in the host wrapper layer (`createSolidEditorHost` or equivalent), not scattered through rendering internals
- during coexistence, both runtimes must accept the same minimal host-level document identity and restore inputs
- legacy runtime remains available as the rollback target until Phase 8 completes

Rollback triggers:

- any confirmed document corruption bug
- IME correctness failure on a required target
- repeated flush or dispatch exceptions in the new runtime
- severe latency regression beyond agreed rollout thresholds

Rollback action:

- disable `editor_runtime_v2`
- keep persisted host state keyed by `documentKey` compatible across both runtimes during coexistence
- stop rollout before deleting legacy files or adapters

---

## Risks and Mitigations

### Risk: IME handling becomes a correctness trap

Mitigation:

- rely on browser input/composition events instead of custom printable key handling
- write explicit manual validation checklist
- keep composition state isolated in one module

### Risk: long lines regress without general 2D virtualization

Mitigation:

- introduce isolated long-line mode with clear threshold
- benchmark a pathological dataset early

### Risk: stale decorations feel ugly during typing

Mitigation:

- keep unaffected line decorations stable via line IDs
- allow edited/new lines to be temporarily plain or lightly stale
- prioritize syntax worker turnaround but never block input on it

### Risk: migration adapters linger and create a half-old, half-new runtime

Mitigation:

- explicitly schedule legacy deletion as a phase
- do not treat adapters as permanent public APIs

### Risk: view rewrite introduces hidden DOM complexity

Mitigation:

- keep the view split into small imperative layers
- row pool, text layer, gutter layer, and overlay layer should each remain focused
- preserve one scheduler and one session owner

---

## Decision Rationale

The main architecture choices in this RFC are intentional, not accidental:

- Keep DOM text rendering in v1 and move complexity out of Solid first. That captures most of the simplicity/performance win without taking on a canvas renderer at the same time.
- Keep text input browser-native and make decorations eventually consistent. That removes the need for optimistic highlight offsets and similar defensive machinery.
- Start with vertical virtualization and isolate long-line handling. That keeps the common case simple while leaving room for specialized long-line logic.

---

## Open Decisions

These should be resolved during implementation, but the RFC recommends defaults.

### Decision 1: Overlay Rendering Mode

- Recommended default: imperative DOM overlay
- Alternative: canvas overlay

### Decision 2: Multi-Selection Scope in v1

- Recommended default: keep array-based data model, preserve current primary-selection behavior first

### Decision 3: Long-Line Threshold

- Recommended default: start conservative and benchmark

### Decision 4: Visible Content Snapshot Persistence

- Recommended default: keep only if profiling proves meaningful after the rewrite

### Decision 5: Fold Identity Strategy

- Recommended default: line-ID-based where possible, with async fold refresh when structural edits occur

---

## Appendix A: Current Hot Files

These files are the primary motivation for the rewrite and should be referenced during migration planning.

- `packages/code-editor/src/editor/components/TextEditorView.tsx`
- `packages/code-editor/src/editor/components/EditorViewport.tsx`
- `packages/code-editor/src/editor/hooks/createTextEditorInput.ts`
- `packages/code-editor/src/editor/hooks/createTextEditorLayout.ts`
- `packages/code-editor/src/editor/hooks/createLineHighlights.ts`
- `packages/code-editor/src/editor/cursor/context/CursorContext.tsx`
- `packages/code-editor/src/editor/line/components/Lines.tsx`
- `packages/code-editor/src/editor/line/components/LineRow.tsx`
- `packages/code-editor/src/editor/line/components/Syntax.tsx`
- `packages/code-editor/src/editor/selection/hooks/useSelectionRects.ts`
- `apps/web/src/fs/hooks/useEditorDecorations.ts`
- `apps/web/src/treeSitter/incrementalEdits.ts`

---

## Appendix B: Proposed Interfaces

### Core

```ts
type OffsetMappingHint = {
	ranges: Array<{
		oldStart: number
		oldEnd: number
		newEnd: number
	}>
}

type DocumentIdentity = {
	sessionId: string
	documentKey: string
	documentIncarnation: number
}

type ScrollAnchorHint =
	| { kind: 'delta'; deltaPx: number }
	| { kind: 'anchor'; lineId: number; offsetPx: number }

type EditorDirtyState = {
	identity: DocumentIdentity
	docVersion: number
	decorationVersion: number
	text: boolean
	gutter: boolean
	overlay: boolean
	viewport: boolean
	fullMeasure: boolean
	lineRange: { start: number; end: number } | null
	decorationLineIds: number[] | null
	scrollAnchor: ScrollAnchorHint | null
}

type EditorCore = {
	dispatch(tx: EditorTransaction): DispatchResult
	updateViewport(input: {
		scrollTop: number
		scrollLeft: number
		viewportWidth: number
		viewportHeight: number
	}): void
	applyDecorations(snapshot: DecorationSnapshot): void
	getSnapshot(): EditorSnapshot
	getLineCount(): number
	getLineId(index: number): number
	getLineIndex(lineId: number): number
	getLineRecord(index: number): {
		id: number
		revision: number
		text: string
		start: number
		length: number
		textLength: number
	}
	getLineRecordById(lineId: number): {
		id: number
		revision: number
		text: string
		start: number
		length: number
		textLength: number
	}
	getLineText(index: number): string
	getLineTextById(lineId: number): string
	getLineRevision(lineId: number): number
	getSelections(): SelectionRange[]
	getViewport(): ViewportSnapshot
	onDidChange(listener: (dirty: EditorDirtyState) => void): () => void
}
```

### View

```ts
type FlushReceipt = {
	identity: DocumentIdentity
	docVersion: number
	rowsUpdated: number
	overlayUpdated: boolean
	gutterUpdated: boolean
	durationMicros: number
}

type ViewMeasurements = {
	columnToX(lineId: number, column: number): number
	xToColumn(lineId: number, x: number): number
	lineFromClientY(clientY: number): { lineIndex: number; lineId: number } | null
	getCaretRect(lineId: number, column: number): DOMRect | null
}

type EditorView = {
	attach(root: HTMLElement): void
	detach(): void
	flush(dirty: EditorDirtyState, snapshot: EditorSnapshot): FlushReceipt
	measure(): ViewMeasurements
	focusInput(): void
	getScrollElement(): HTMLElement | null
}
```

### Input Controller

```ts
type InputController = {
	attach(target: HTMLElement): void
	detach(): void
	focus(): void
}
```

### Decoration Snapshot

```ts
type DecorationSnapshot = {
	identity: DocumentIdentity
	docVersion: number
	syntax: ExternalSyntaxCapture[]
	errors: ExternalDiagnosticRange[]
	brackets?: ExternalBracketInfo[]
	folds?: ExternalFoldInfo[]
}
```

### Persisted View State

```ts
type PersistedEditorViewState = {
	scrollTop: number
	scrollLeft: number
	cursor: { line: number; column: number } | null
	selections: SelectionRange[]
}
```

---

## Appendix C: Sequence Diagrams

### 1. Ordinary Text Insertion

```text
User types "a"
  -> browser input event
  -> InputController receives `beforeinput` / `input`
  -> InputController dispatches `insert-text`
  -> EditorCore mutates document + selections + history
  -> EditorCore emits dirty line range
  -> FrameScheduler requests RAF
  -> EditorView flushes dirty rows + overlay
  -> text is visible
  -> WorkerBridge sends incremental update asynchronously
  -> Decoration snapshot returns later
  -> DecorationStore applies if version matches
  -> Scheduler repaints affected rows
```

### 2. Cursor Navigation

```text
User presses ArrowDown
  -> keydown
  -> InputController recognizes navigation command
  -> EditorCore dispatches `move-cursor`
  -> selection/cursor changes
  -> overlay dirty, maybe viewport dirty
  -> scheduler flushes overlay
  -> no text rerender unless scroll changed visible rows
```

### 3. Syntax Snapshot Arrival

```text
Worker finishes parse for docVersion 42
  -> WorkerBridge receives snapshot(42)
  -> compare with EditorCore.docVersion
  -> if stale, discard
  -> if current, DecorationStore converts to line-ID-keyed data
  -> affected line IDs marked dirty
  -> scheduler flushes those visible rows
```

### 4. Newline Insert

```text
User presses Enter
  -> browser input event for line break
  -> InputController dispatches insert of "\n"
  -> EditorCore splits line / allocates line ID / updates line starts
  -> structureVersion increments
  -> dirty line range includes split zone and viewport metadata
  -> scheduler flushes row pool remap + text + gutter + overlay
  -> worker catches up later for folds/highlights
```

---

## Final Recommendation

Do the rewrite.

Do it around the following non-negotiables:

- one core
- one scheduler
- one view
- native text input
- async versioned decorations
- vertical virtualization first
- long-line mode as an isolated special case
- Solid only as shell

If we stay disciplined about those boundaries, the editor becomes both simpler and faster.

If we compromise on those boundaries, we will rebuild the same complexity with different names.
