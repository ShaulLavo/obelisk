# Editor Pipeline Rewrite — Implementation Checklist

This document turns `docs/editor-pipeline-rewrite-rfc.md` into an execution checklist.

It is an implementation plan, not a second RFC.

## How To Use This Doc

- Work phases in order.
- Do not start the next phase until the current phase exit gate is met.
- Keep each phase shippable behind temporary adapters if needed.
- Delete migration scaffolding as soon as the next phase makes it unnecessary.
- If a phase requires broad compatibility glue, the phase is too large and should be split.

## Global Rules

- [ ] Keep `docs/editor-pipeline-rewrite-rfc.md` as the architecture source of truth.
- [ ] Keep `bun` as the package manager and script runner.
- [ ] Keep benchmarks runnable throughout the migration.
- [ ] Keep one authoritative document model in the new runtime, even while adapters exist.
- [ ] Keep viewport sync and async decorations outside undo history.
- [ ] Keep text paint independent from syntax worker latency.
- [ ] Keep the v1 geometry invariant explicit: monospace-only.
- [ ] Keep pointer hit testing on the legacy path until the new measurement API exists.
- [ ] Keep public exports shrinking over time; do not add new broad internal exports.

## Master Tracker

- [ ] Phase 0 — Baseline, Rules, and Instrumentation
- [ ] Phase 1 — Carve Out `EditorCore`
- [ ] Phase 2 — Introduce `FrameScheduler`
- [ ] Phase 3 — Replace Input Path
- [ ] Phase 4 — Replace View with Imperative Visible-Range Renderer
- [ ] Phase 5 — Rebuild Decoration Pipeline
- [ ] Phase 6 — Folds, Width Scan, Long-Line Mode
- [ ] Phase 7 — Reconnect Minimap and Persistence
- [ ] Phase 8 — Delete Legacy Pipeline

---

## Phase 0 — Baseline, Rules, and Instrumentation

**Goal**

Lock in performance, memory, and trace baselines before changing runtime ownership.

**Primary files**

- `packages/code-editor/src/editor/benchmarks/utils/performanceMetrics.ts`
- `packages/code-editor/src/editor/benchmarks/utils/testEditorSetup.tsx`
- `packages/code-editor/src/editor/benchmarks/utils/typingSimulator.ts`
- `packages/code-editor/src/editor/benchmarks/typing.browser.bench.tsx`
- `packages/code-editor/src/editor/benchmarks/data/`

**Checklist**

- [ ] Define fixture classes: small file, large file, highlight-heavy file, long-line file.
- [ ] Reuse the existing benchmark harness instead of introducing a second path.
- [ ] Add timing marks for input-received, transaction-start, transaction-end, frame-requested, frame-flush-start, and frame-flush-end.
- [ ] Record rows-updated, overlay-updated, stale-worker-discard count, long-line activations, and cache memory estimates.
- [ ] Add a deterministic canary typing trace that replays the same edit sequence on every run.
- [ ] Store baseline results in a committed markdown file or script output artifact.
- [ ] Document the exact command used to run the baseline.

**Validation**

- [ ] The old editor path can be benchmarked repeatedly with the same fixtures.
- [ ] Keypress-to-paint can be measured before any rewrite code lands.
- [ ] Canary trace results are stable enough to compare phase-to-phase.

**Exit Gate**

- [ ] Baseline metrics exist.
- [ ] Canary replay exists.
- [ ] Benchmark commands are documented.

---

## Phase 1 — Carve Out `EditorCore`

**Goal**

Move document, selection, history, transaction, and dirty ownership into a framework-free core.

**Create**

- `packages/code-editor/src/core/makeEditorCore.ts`
- `packages/code-editor/src/core/types.ts`
- `packages/code-editor/src/core/document/DocumentModel.ts`
- `packages/code-editor/src/core/document/lineIndex.ts`
- `packages/code-editor/src/core/document/lineIds.ts`
- `packages/code-editor/src/core/document/transactions.ts`
- `packages/code-editor/src/core/history/HistoryModel.ts`
- `packages/code-editor/src/core/history/historyEntries.ts`
- `packages/code-editor/src/core/selection/CursorModel.ts`
- `packages/code-editor/src/core/selection/selectionMath.ts`
- `packages/code-editor/src/core/viewport/ViewportModel.ts`

**Likely touch**

- `packages/code-editor/src/editor/cursor/`
- `packages/code-editor/src/editor/history/`
- `packages/code-editor/src/editor/utils/incrementalEdits.ts`
- `packages/code-editor/src/editor/types.ts`

**Checklist**

- [ ] Define `DocumentIdentity`, version counters, and `EditorDirtyState` in core-owned types.
- [ ] Implement core getters for line count, line index, line ID, line record, text by line, offset conversions, selections, and viewport snapshot.
- [ ] Move line-start and line-ID maintenance out of Solid state.
- [ ] Implement `dispatch(transaction)` with draft-based commit and rollback.
- [ ] Add `replace-document` and `replace-content` as distinct operations.
- [ ] Add `apply-edits` for atomic batch edits.
- [ ] Implement line revision tracking.
- [ ] Implement monotonic line IDs with no reuse on undo/redo.
- [ ] Implement dirty accumulation merge rules.
- [ ] Implement dispatch re-entrancy queueing.
- [ ] Implement history coalescing defaults.
- [ ] Keep v1 selection semantics single-selection only, even if the stored shape remains `SelectionRange[]`.
- [ ] Add a temporary adapter so the current Solid runtime can read from `EditorCore` without owning document state.

**Tests**

- [ ] Unit test insert, delete, replace-range, and `apply-edits`.
- [ ] Unit test undo/redo, including composition-group and batch-edit boundaries.
- [ ] Unit test line ID allocation and line revision updates.
- [ ] Unit test dirty accumulator merges.
- [ ] Unit test re-entrant dispatch queue semantics.

**Exit Gate**

- [ ] Text edits can run in tests without Solid.
- [ ] Core is the only authority for document and selection state.
- [ ] No new text mutation depends on Solid signals or stores.

---

## Phase 2 — Introduce `FrameScheduler`

**Goal**

Route all repaint work through one explicit scheduler before swapping out the view.

**Create**

- `packages/code-editor/src/runtime/makeFrameScheduler.ts`
- `packages/code-editor/src/runtime/performance.ts`

**Likely touch**

- `packages/code-editor/src/editor/components/Editor.tsx`
- `packages/code-editor/src/editor/components/TextEditorView.tsx`
- `packages/code-editor/src/editor/components/EditorViewport.tsx`

**Checklist**

- [ ] Implement a scheduler that coalesces dirty state until the next RAF.
- [ ] Make scheduler consume the merged dirty accumulator instead of ad hoc repaint triggers.
- [ ] Return a `FlushReceipt` from every flush.
- [ ] Add a temporary flush adapter so the current view can be scheduled without changing its rendering model yet.
- [ ] Route resize-driven and scroll-driven paint requests through the scheduler.
- [ ] Keep viewport-only updates on the cheap `updateViewport` path.

**Tests**

- [ ] Unit test dirty coalescing across multiple mutations before one frame.
- [ ] Unit test viewport-only updates avoiding history work.
- [ ] Unit test flush receipt emission.

**Exit Gate**

- [ ] Every repaint request goes through one scheduler.
- [ ] Scheduler can be tested against a fake view target.

---

## Phase 3 — Replace Input Path

**Goal**

Replace reactive input orchestration with a small DOM-event adapter that emits commands and transactions.

**Create**

- `packages/code-editor/src/input/makeInputController.ts`
- `packages/code-editor/src/input/composition.ts`
- `packages/code-editor/src/input/clipboard.ts`
- `packages/code-editor/src/commands/EditorCommand.ts`
- `packages/code-editor/src/commands/CommandRouter.ts`
- `packages/code-editor/src/commands/builtins.ts`

**Likely touch**

- `packages/code-editor/src/editor/components/Input.tsx`
- `packages/code-editor/src/editor/hooks/createTextEditorInput.ts`
- `packages/code-editor/src/editor/utils/clipboard.ts`

**Checklist**

- [ ] Define `EditorCommand` separate from DOM event handling.
- [ ] Route printable text through `beforeinput` and `input`, not per-character keybindings.
- [ ] Route navigation, undo/redo, select-all, save, and structural commands through `keydown`.
- [ ] Implement block indent/dedent as command routing to one atomic `apply-edits` transaction.
- [ ] Implement hidden-textarea mirror-window sync around the caret or composition span.
- [ ] Implement composition state machine and reconciliation policy.
- [ ] Collapse one composition session into one undo step.
- [ ] Keep pointer hit testing, drag selection geometry, and mirrored input-surface positioning on the legacy path until Phase 4.
- [ ] Keep any Phase 3 adapter narrow and measurement-focused; do not build a broad compatibility layer.

**Tests**

- [ ] Unit test command translation with a fake dispatcher.
- [ ] Browser integration test ordinary typing.
- [ ] Browser integration test paste, delete, and undo/redo.
- [ ] Browser replay test composition sequences for Chromium-family behavior.
- [ ] Browser replay test composition sequences for WebKit-family behavior.

**Exit Gate**

- [ ] Ordinary typing no longer depends on command registration for characters.
- [ ] IME works on required browsers.
- [ ] Input logic no longer owns document mutation logic directly.

---

## Phase 4 — Replace View with Imperative Visible-Range Renderer

**Goal**

Replace the reactive view tree with an imperative bounded visible-range renderer and a shared measurement API.

**Create**

- `packages/code-editor/src/view/makeEditorView.ts`
- `packages/code-editor/src/view/makeVisibleRangeRenderer.ts`
- `packages/code-editor/src/view/TextLayer.ts`
- `packages/code-editor/src/view/GutterLayer.ts`
- `packages/code-editor/src/view/OverlayLayer.ts`
- `packages/code-editor/src/view/lineHtml.ts`
- `packages/code-editor/src/view/textRuns.ts`
- `packages/code-editor/src/view/domMetrics.ts`

**Likely touch**

- `packages/code-editor/src/editor/components/TextEditorView.tsx`
- `packages/code-editor/src/editor/components/EditorViewport.tsx`
- `packages/code-editor/src/editor/components/Editor.tsx`

**Checklist**

- [ ] Build the host DOM structure with scroll container, gutter layer, text layer, overlay layer, and hidden input surface.
- [ ] Implement bounded vertical visible-range rendering with explicit overscan and hard cap.
- [ ] Implement row cache keys using line ID, line revision, decoration revision, theme version, and render mode.
- [ ] Implement plain-text fast path via `textContent`.
- [ ] Implement decorated-line path via cached `innerHTML` only when the cache key changes.
- [ ] Implement one measurement API for `columnToX`, `xToColumn`, `lineFromClientY`, and `getCaretRect`.
- [ ] Make all geometry tab-aware under the monospace-only invariant.
- [ ] Move pointer hit testing and drag selection onto the new measurement API.
- [ ] Move mirrored input-surface positioning onto the new measurement API in the same switch.
- [ ] Implement `ResizeObserver`-driven viewport updates.
- [ ] Implement scroll anchoring for edits above the viewport.
- [ ] Implement lazy theme-change cache invalidation for offscreen rows.

**Tests**

- [ ] Test scroll smoothness and no-flicker behavior against the current implementation.
- [ ] Test single-character insert updating only necessary rows.
- [ ] Test overlay-only cursor updates without text rerender.
- [ ] Test tab-aware caret geometry.
- [ ] Test pointer hit testing with tabs.

**Exit Gate**

- [ ] Visible rows are no longer Solid components in the hot path.
- [ ] Scrolling matches the current implementation's smoothness and no-flicker behavior.
- [ ] DOM row recycling is not introduced in v1.
- [ ] Input, overlay, and layout all consume the same measurement API.

---

## Phase 5 — Rebuild Decoration Pipeline

**Goal**

Replace optimistic highlight remapping with versioned decoration application and explicit worker ownership.

**Create**

- `packages/code-editor/src/core/decorations/makeDecorationStore.ts`
- `packages/code-editor/src/core/decorations/decorationSegments.ts`
- `packages/code-editor/src/core/decorations/bracketDepths.ts`
- `packages/code-editor/src/runtime/makeWorkerBridge.ts`

**Likely touch**

- `packages/code-editor/src/editor/hooks/createLineHighlights.ts`
- `packages/code-editor/src/editor/utils/highlights.ts`
- `packages/code-editor/src/editor/minimap/tokenSummary.ts`

**Checklist**

- [ ] Implement line-ID-keyed decoration storage with per-line decoration revision.
- [ ] Apply async snapshots only when `DocumentIdentity` and `docVersion` match.
- [ ] Keep stale decorations usable only as visual fallback when line ID survives and line revision is unchanged.
- [ ] Add a synchronous search-decoration channel for find/replace.
- [ ] Add `setSearchState` to the session/runtime surface.
- [ ] Make visible search results update immediately on query change.
- [ ] Make replace-current use `replace-range`.
- [ ] Make replace-all use one `apply-edits` transaction.
- [ ] Implement worker health timeout, crash detection, restart, and queue coalescing.
- [ ] Clear authoritative worker-backed decorations when the worker is unhealthy.
- [ ] Delete optimistic highlight offset logic from the rewrite path.

**Tests**

- [ ] Unit test stale snapshot discard.
- [ ] Unit test fallback decoration reuse rules.
- [ ] Browser test visible search highlights updating immediately.
- [ ] Browser test replace-all as one undo step.
- [ ] Integration test worker restart and recovery behavior.

**Exit Gate**

- [ ] Typing never waits for worker catch-up.
- [ ] Stale async results are harmless.
- [ ] Search highlight updates are synchronous and visibly immediate.

---

## Phase 6 — Folds, Width Scan, Long-Line Mode

**Goal**

Reconnect structural display features without reintroducing reactive layout complexity.

**Create**

- `packages/code-editor/src/core/display/DisplayModel.ts`
- `packages/code-editor/src/core/display/displayMapping.ts`
- `packages/code-editor/src/core/folds/FoldModel.ts`
- `packages/code-editor/src/core/folds/foldMapping.ts`
- `packages/code-editor/src/view/LongLineRenderer.ts`

**Likely touch**

- `packages/code-editor/src/editor/hooks/createFoldMapping.ts`
- `packages/code-editor/src/editor/hooks/createTextEditorLayout.ts`
- `packages/code-editor/src/editor/hooks/scanLineWidthSlice.test.ts`
- `packages/code-editor/src/editor/hooks/widthScanReset.test.ts`

**Checklist**

- [ ] Introduce `DisplayModel` for display-to-document mapping.
- [ ] Reconnect fold-open state without leaking fold math into the view.
- [ ] Implement width scan outside Solid.
- [ ] Track the current max-width owner line ID.
- [ ] Rescan width in idle slices when the max-width owner changes.
- [ ] Keep width temporarily overestimated during rescan, but never permanently oversized.
- [ ] Implement isolated long-line rendering mode.
- [ ] Keep long-line code out of the normal line renderer.
- [ ] Verify gutter, viewport mapping, and overlay geometry through folds.

**Tests**

- [ ] Test fold mapping and display-line conversions.
- [ ] Test width shrink after deleting or shortening the longest line.
- [ ] Test long-line activation threshold behavior.
- [ ] Test folded viewport anchoring.

**Exit Gate**

- [ ] Common files still use simple vertical virtualization.
- [ ] Long lines no longer force a 2D reactive architecture back into the runtime.

---

## Phase 7 — Reconnect Minimap and Persistence

**Goal**

Attach slower observers after the main edit/render path is stable.

**Create**

- `packages/code-editor/src/runtime/makeEditorSession.ts`
- `packages/code-editor/src/solid/Editor.tsx`
- `packages/code-editor/src/solid/createSolidEditorHost.ts`

**Likely touch**

- `packages/code-editor/src/editor/minimap/`
- `apps/web/src/split-editor/components/FileTab.tsx`
- any host persistence wiring that currently restores scroll, cursor, selections, or visible content snapshots

**Checklist**

- [ ] Reconnect minimap as an observer of document and decoration summaries.
- [ ] Reconnect persisted view state through the host adapter, not through the hot edit path.
- [ ] Restore scroll, cursor, and selections through one view-state object.
- [ ] Reconnect app-shell expectations for tabs, panes, and active-editor restoration.
- [ ] Reintroduce visible-content snapshotting only if benchmarks prove it wins.
- [ ] Keep shell-facing API smaller than the current migration-era prop surface.
- [ ] Move the public component/session boundary to the new runtime entrypoints.

**Tests**

- [ ] Browser test file switch with view-state restore.
- [ ] Browser test pane/tab round-trip behavior.
- [ ] Browser test minimap remaining responsive without affecting typing latency.

**Exit Gate**

- [ ] Minimap no longer affects typing responsiveness.
- [ ] Persistence is outside the hot path.
- [ ] Host API surface is measurably smaller than before.

---

## Phase 8 — Delete Legacy Pipeline

**Goal**

Remove the old runtime, old exports, and migration scaffolding completely.

**Likely delete or heavily reduce**

- `packages/code-editor/src/editor/components/TextEditorView.tsx`
- `packages/code-editor/src/editor/components/EditorViewport.tsx`
- `packages/code-editor/src/editor/hooks/createTextEditorInput.ts`
- `packages/code-editor/src/editor/hooks/createTextEditorLayout.ts`
- `packages/code-editor/src/editor/hooks/createLineHighlights.ts`
- `packages/code-editor/src/editor/hooks/index.ts`
- obsolete line/selection hooks that were only supporting the reactive runtime

**Likely touch**

- `packages/code-editor/src/editor/index.tsx`
- `packages/code-editor/src/index.ts`

**Checklist**

- [ ] Delete legacy orchestration files.
- [ ] Delete legacy highlight offset types and compatibility logic.
- [ ] Delete migration adapters.
- [ ] Stop exporting broad internal hooks from the package root.
- [ ] Keep only stable public session/component/types exports.
- [ ] Remove dead tests that only exercised deleted runtime paths.
- [ ] Re-run benchmarks against the new runtime only.

**Validation**

- [ ] The package has one editor runtime.
- [ ] The hot path can be explained from input controller to core to scheduler to view without referencing Solid internals.
- [ ] Benchmarks show the rewrite did not regress the guarded scenarios.

**Exit Gate**

- [ ] Legacy runtime is gone.
- [ ] Public exports are intentionally small.
- [ ] Benchmarks and tests pass on the new path only.

---

## Final Done Criteria

- [ ] The editor hot path is `DOM event -> command/transaction -> EditorCore -> FrameScheduler -> EditorView`.
- [ ] Solid is shell-only for mount/unmount, slow config, and host wiring.
- [ ] Text entry is browser-native and IME-safe.
- [ ] Async decorations are versioned and disposable.
- [ ] Search is synchronous enough to feel immediate.
- [ ] Undo behavior is predictable for typing, composition, batch edits, and replace-all.
- [ ] Required browser targets are verified.
- [ ] The rewrite ships with the benchmark harness still usable.
