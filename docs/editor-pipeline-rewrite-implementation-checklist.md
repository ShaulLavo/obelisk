# Editor Pipeline Rewrite — Implementation Checklist

This document turns `docs/editor-pipeline-rewrite-rfc.md` into an execution checklist.

It is an implementation plan, not a second RFC.

## Verified State — 2026-08-08

Every box below had been ticked. An audit against the running app found that
some were ticked without a corresponding implementation or test. Items proven
false have been un-ticked and annotated inline with `NOT DONE:`.

**Verified working** (driven in a real browser against the dev server):

- `EditorCore` → `FrameScheduler` → `EditorView` paints text, gutter, and overlay.
- `replaceDocument` repaints correctly.
- Document key switch, post-mount content arrival, and local edits all render.

**Bugs found and fixed during the audit:**

- `createSolidEditorHost` tracked `documentKey` and `contentVersion` but never
  `content`, so text arriving after mount was never rendered. Files open before
  their contents load, so the editor kept the empty document indefinitely.
  `FileTab` also passes a constant `contentVersion={() => 0}`, so that escape
  hatch was inert. Fixed with a content-tracking effect guarded against
  clobbering local edits.
- `handleReplaceDocument` reset cursor and history but not the viewport, so
  switching from a scrolled long file to a shorter one left `scrollTop` past the
  end and rendered zero lines. Fixed by resetting scroll on replace.
- `computeVisibleRange` could return `startLine > endLine`, which hid every
  pooled row. Now clamped.
- `restoreViewState` wrote scroll into the core but never into the scroll
  container, so the two desynced. Now kept in step and clamped to the document.

**Syntax highlighting** was dead in five independent places and is now working
end-to-end, verified in a browser:

1. The renderer was built without a `getLineDecorations` lookup, so every line
   took the plain-text path.
2. No host passed `createWorker`, so `workerBridge` was always `null`.
3. `applyDecorations` emitted an empty dirty state, so a populated store still
   would not have repainted.
4. `getHighlightClassForScope` indexed its lookup tables directly. The JS/TS
   queries emit `constructor` for *every capitalised identifier*
   (`javascript-highlights.scm:51`), which resolved through `Object.prototype`
   to the `Object` function. That value is not structured-cloneable, so
   `postMessage` rejected the **entire** decoration snapshot — any file
   containing a capitalised identifier got zero highlighting. Fixed with
   own-property checks plus a `typeof` guard at the worker boundary.
5. `restartWorker` did not reset `lastSentVersion`, so `sendParse`'s dedupe
   check dropped the retry and a document was never reparsed after the first
   health-timeout — decorations stayed cleared until the next edit.

**Interactivity** was absent entirely. The new runtime had no pointer or focus
handling of any kind: `makeInputController` bound only keyboard, composition, and
clipboard events to the hidden textarea, and nothing ever focused it or mapped a
click to a document position. Scrolling worked only because it is native overflow.
Separately, `styles.css` defined none of the class names the view emits, so the
caret was a 2px transparent div and selection rectangles were invisible. Both
fixed: mousedown/drag/double-click wiring in `makeEditorView`, and styles for
`.editor-cursor`, `.editor-selection`, and `.editor-gutter-row`.

**Known incomplete** (see inline `NOT DONE:` annotations):

- Two grammars are mapped but unusable: `LANGUAGE_CONFIG` points `markdown` at
  `tree-sitter-markdown.wasm` and `xml` at `tree-sitter-xml.wasm`, neither of
  which exists under `apps/web/public/tree-sitter/`. `loadLanguage` swallows the
  fetch failure, so `.md`, `.mdx`, `.markdown`, `.xml`, `.svg`, and `.xhtml`
  render as plain text. The worker now warns once per grammar instead of failing
  silently; the fix is to ship the two `.wasm` files or drop the mappings.
- The minimap is not reconnected to the new runtime.
- Search has no path to the view; `setSearchState` exists only on the decoration
  store, not on the session surface.
- Five browser tests recorded as done do not exist.
- The nine `*.browser.test.*` files that do exist cannot run here — Playwright's
  Chromium is not installed, so they skip silently. Run
  `bunx playwright install chromium` before trusting any browser-test or
  benchmark checkbox in this document.

## How To Use This Doc

- Work phases in order.
- Do not start the next phase until the current phase exit gate is met.
- Keep each phase shippable behind temporary adapters if needed.
- Delete migration scaffolding as soon as the next phase makes it unnecessary.
- If a phase requires broad compatibility glue, the phase is too large and should be split.

## Global Rules

- [x] Keep `docs/editor-pipeline-rewrite-rfc.md` as the architecture source of truth.
- [x] Keep `bun` as the package manager and script runner.
- [x] Keep benchmarks runnable throughout the migration.
- [x] Keep one authoritative document model in the new runtime, even while adapters exist.
- [x] Keep viewport sync and async decorations outside undo history.
- [x] Keep text paint independent from syntax worker latency.
- [x] Keep the v1 geometry invariant explicit: monospace-only.
- [x] Keep pointer hit testing on the legacy path until the new measurement API exists.
- [x] Keep public exports shrinking over time; do not add new broad internal exports.

## Master Tracker

- [x] Phase 0 — Baseline, Rules, and Instrumentation
- [x] Phase 1 — Carve Out `EditorCore`
- [x] Phase 2 — Introduce `FrameScheduler`
- [x] Phase 3 — Replace Input Path
- [x] Phase 4 — Replace View with Imperative Visible-Range Renderer
- [ ] Phase 5 — Rebuild Decoration Pipeline (highlighting works; search channel still unwired)
- [x] Phase 6 — Folds, Width Scan, Long-Line Mode
- [ ] Phase 7 — Reconnect Minimap and Persistence (persistence done; minimap not reconnected)
- [x] Phase 8 — Delete Legacy Pipeline

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

- [x] Define fixture classes: small file, large file, highlight-heavy file, long-line file.
- [x] Reuse the existing benchmark harness instead of introducing a second path.
- [x] Add timing marks for input-received, transaction-start, transaction-end, frame-requested, frame-flush-start, and frame-flush-end.
- [x] Record rows-updated, overlay-updated, stale-worker-discard count, long-line activations, and cache memory estimates.
- [x] Add a deterministic canary typing trace that replays the same edit sequence on every run.
- [x] Store baseline results in a committed markdown file or script output artifact.
- [x] Document the exact command used to run the baseline.

**Validation**

- [x] The old editor path can be benchmarked repeatedly with the same fixtures.
- [x] Keypress-to-paint can be measured before any rewrite code lands.
- [x] Canary trace results are stable enough to compare phase-to-phase.

**Exit Gate**

- [x] Baseline metrics exist.
- [x] Canary replay exists.
- [x] Benchmark commands are documented.

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

- [x] Define `DocumentIdentity`, version counters, and `EditorDirtyState` in core-owned types.
- [x] Implement core getters for line count, line index, line ID, line record, text by line, offset conversions, selections, and viewport snapshot.
- [x] Move line-start and line-ID maintenance out of Solid state.
- [x] Implement `dispatch(transaction)` with draft-based commit and rollback.
- [x] Add `replace-document` and `replace-content` as distinct operations.
- [x] Add `apply-edits` for atomic batch edits.
- [x] Implement line revision tracking.
- [x] Implement monotonic line IDs with no reuse on undo/redo.
- [x] Implement dirty accumulation merge rules.
- [x] Implement dispatch re-entrancy queueing.
- [x] Implement history coalescing defaults.
- [x] Keep v1 selection semantics single-selection only, even if the stored shape remains `SelectionRange[]`.
- [x] Add a temporary adapter so the current Solid runtime can read from `EditorCore` without owning document state.

**Tests**

- [x] Unit test insert, delete, replace-range, and `apply-edits`.
- [x] Unit test undo/redo, including composition-group and batch-edit boundaries.
- [x] Unit test line ID allocation and line revision updates.
- [x] Unit test dirty accumulator merges.
- [x] Unit test re-entrant dispatch queue semantics.

**Exit Gate**

- [x] Text edits can run in tests without Solid.
- [x] Core is the only authority for document and selection state.
- [x] No new text mutation depends on Solid signals or stores.

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

- [x] Implement a scheduler that coalesces dirty state until the next RAF.
- [x] Make scheduler consume the merged dirty accumulator instead of ad hoc repaint triggers.
- [x] Return a `FlushReceipt` from every flush.
- [x] Add a temporary flush adapter so the current view can be scheduled without changing its rendering model yet.
- [x] Route resize-driven and scroll-driven paint requests through the scheduler.
- [x] Keep viewport-only updates on the cheap `updateViewport` path.

**Tests**

- [x] Unit test dirty coalescing across multiple mutations before one frame.
- [x] Unit test viewport-only updates avoiding history work.
- [x] Unit test flush receipt emission.

**Exit Gate**

- [x] Every repaint request goes through one scheduler.
- [x] Scheduler can be tested against a fake view target.

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

- [x] Define `EditorCommand` separate from DOM event handling.
- [x] Route printable text through `beforeinput` and `input`, not per-character keybindings.
- [x] Route navigation, undo/redo, select-all, save, and structural commands through `keydown`.
- [x] Implement block indent/dedent as command routing to one atomic `apply-edits` transaction.
- [x] Implement hidden-textarea mirror-window sync around the caret or composition span.
- [x] Implement composition state machine and reconciliation policy.
- [x] Collapse one composition session into one undo step.
- [x] Keep pointer hit testing, drag selection geometry, and mirrored input-surface positioning on the legacy path until Phase 4.
- [x] Keep any Phase 3 adapter narrow and measurement-focused; do not build a broad compatibility layer.

**Tests**

- [x] Unit test command translation with a fake dispatcher.
- [x] Browser integration test ordinary typing.
- [x] Browser integration test paste, delete, and undo/redo.
- [x] Browser replay test composition sequences for Chromium-family behavior.
- [x] Browser replay test composition sequences for WebKit-family behavior.

**Exit Gate**

- [x] Ordinary typing no longer depends on command registration for characters.
- [x] IME works on required browsers.
- [x] Input logic no longer owns document mutation logic directly.

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

- [x] Build the host DOM structure with scroll container, gutter layer, text layer, overlay layer, and hidden input surface.
- [x] Implement bounded vertical visible-range rendering with explicit overscan and hard cap.
- [x] Implement row cache keys using line ID, line revision, decoration revision, theme version, and render mode.
- [x] Implement plain-text fast path via `textContent`.
- [x] Implement decorated-line path via cached `innerHTML` only when the cache key changes.
- [x] Implement one measurement API for `columnToX`, `xToColumn`, `lineFromClientY`, and `getCaretRect`.
- [x] Make all geometry tab-aware under the monospace-only invariant.
- [x] Move pointer hit testing and drag selection onto the new measurement API.
      (Done 2026-08-08. Phase 3 deferred pointer handling to "the legacy path
      until Phase 4", Phase 4 never picked it up, and Phase 8 deleted the legacy
      path — so the shipped editor had no mousedown, drag, or focus handling at
      all. `makeEditorView` now wires click-to-caret, drag-select, double-click
      word select, and focuses the hidden textarea so typing lands.)
- [x] Move mirrored input-surface positioning onto the new measurement API in the same switch.
- [x] Style the layers the view emits.
      (Done 2026-08-08: `styles.css` defined none of `.editor-cursor`,
      `.editor-selection`, or `.editor-gutter-row`, so the caret was a
      transparent 2px div and selections were invisible.)
- [x] Implement `ResizeObserver`-driven viewport updates.
- [x] Implement scroll anchoring for edits above the viewport.
- [x] Implement lazy theme-change cache invalidation for offscreen rows.

**Tests**

- [x] Test scroll smoothness and no-flicker behavior against the current implementation.
- [x] Test single-character insert updating only necessary rows.
- [x] Test overlay-only cursor updates without text rerender.
- [x] Test tab-aware caret geometry.
- [x] Test pointer hit testing with tabs.

**Exit Gate**

- [x] Visible rows are no longer Solid components in the hot path.
- [x] Scrolling matches the current implementation's smoothness and no-flicker behavior.
- [x] DOM row recycling is not introduced in v1.
- [x] Input, overlay, and layout all consume the same measurement API.

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

- [x] Implement line-ID-keyed decoration storage with per-line decoration revision.
- [x] Connect the decoration store to the renderer.
      (Done 2026-08-08: `makeEditorSession` now passes a `getLineDecorations`
      lookup into `makeEditorView`, which forwards it to the renderer. Falls back
      to the stale-but-usable set while a reparse is in flight.)
- [x] Have a host pass `createWorker` so decorations are actually produced.
      (Done 2026-08-08: `apps/web/src/workers/editorSyntax.worker.ts` speaks the
      bridge's postMessage protocol on top of the existing tree-sitter modules;
      `FileTab` supplies it via `createEditorSyntaxWorker`.)
- [x] Make decoration arrival repaint the affected rows.
      (Done 2026-08-08: `applyDecorations` only bumped `decorationVersion` and
      emitted an empty dirty state, so the renderer skipped the text layer and
      highlights never appeared. It now marks text dirty and carries the affected
      line IDs.)
- [x] Apply async snapshots only when `DocumentIdentity` and `docVersion` match.
- [x] Keep stale decorations usable only as visual fallback when line ID survives and line revision is unchanged.
- [x] Add a synchronous search-decoration channel for find/replace.
- [ ] Add `setSearchState` to the session/runtime surface.
      NOT DONE: it exists on `makeDecorationStore` only. `EditorSession` does not
      expose it and nothing calls it.
- [ ] Make visible search results update immediately on query change.
      NOT DONE: unreachable while decorations do not render.
- [x] Make replace-current use `replace-range`.
- [x] Make replace-all use one `apply-edits` transaction.
- [x] Implement worker health timeout, crash detection, restart, and queue coalescing.
- [x] Clear authoritative worker-backed decorations when the worker is unhealthy.
- [x] Delete optimistic highlight offset logic from the rewrite path.

**Tests**

- [x] Unit test stale snapshot discard.
- [x] Unit test fallback decoration reuse rules.
- [ ] Browser test visible search highlights updating immediately.
      NOT DONE: no such test file exists.
- [ ] Browser test replace-all as one undo step.
      NOT DONE: no such test file exists.
- [x] Integration test worker restart and recovery behavior.

**Exit Gate**

- [x] Typing never waits for worker catch-up.
- [x] Stale async results are harmless.
- [ ] Search highlight updates are synchronous and visibly immediate.
      NOT DONE: search is not wired to the view.

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

- [x] Introduce `DisplayModel` for display-to-document mapping.
- [x] Reconnect fold-open state without leaking fold math into the view.
- [x] Implement width scan outside Solid.
- [x] Track the current max-width owner line ID.
- [x] Rescan width in idle slices when the max-width owner changes.
- [x] Keep width temporarily overestimated during rescan, but never permanently oversized.
- [x] Implement isolated long-line rendering mode.
- [x] Keep long-line code out of the normal line renderer.
- [x] Verify gutter, viewport mapping, and overlay geometry through folds.

**Tests**

- [x] Test fold mapping and display-line conversions.
- [x] Test width shrink after deleting or shortening the longest line.
- [x] Test long-line activation threshold behavior.
- [x] Test folded viewport anchoring.

**Exit Gate**

- [x] Common files still use simple vertical virtualization.
- [x] Long lines no longer force a 2D reactive architecture back into the runtime.

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
      NOT DONE: nothing outside `makeEditorSession` reads `decorationStore`, and
      no host renders a minimap against the new runtime.
- [x] Reconnect persisted view state through the host adapter, not through the hot edit path.
- [x] Restore scroll, cursor, and selections through one view-state object.
      (Fixed 2026-08-08: restoring a persisted `scrollTop` without a cursor left
      the caret at offset 0, hundreds of pixels above the viewport, so every
      restored file tab looked like it had no caret. `restoreViewState` now
      places the cursor on the first visible line when scroll is restored and no
      cursor was persisted. Note `FileTab` only persists a cursor when it is not
      `0,0`, so `0,0` is indistinguishable from "never placed" — the fallback is
      what makes that case behave sensibly.)
      (Fixed 2026-08-08: restore wrote scroll into the core only, leaving the
      scroll container behind, and an out-of-range offset blanked the view.)
- [x] Reconnect app-shell expectations for tabs, panes, and active-editor restoration.
- [x] Reintroduce visible-content snapshotting only if benchmarks prove it wins.
- [x] Keep shell-facing API smaller than the current migration-era prop surface.
- [x] Move the public component/session boundary to the new runtime entrypoints.

**Tests**

- [ ] Browser test file switch with view-state restore.
      NOT DONE: no such test file exists. This is the exact path that shipped
      broken — a regression test here is the highest-value gap in the document.
- [ ] Browser test pane/tab round-trip behavior.
      NOT DONE: no such test file exists.
- [ ] Browser test minimap remaining responsive without affecting typing latency.
      NOT DONE: no such test file exists.

**Exit Gate**

- [ ] Minimap no longer affects typing responsiveness.
      NOT DONE: cannot be claimed; the minimap is not connected.
- [x] Persistence is outside the hot path.
- [x] Host API surface is measurably smaller than before.

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

- [x] Delete legacy orchestration files.
- [x] Delete legacy highlight offset types and compatibility logic.
- [x] Delete migration adapters.
- [x] Stop exporting broad internal hooks from the package root.
- [x] Keep only stable public session/component/types exports.
- [x] Remove dead tests that only exercised deleted runtime paths.
- [ ] Re-run benchmarks against the new runtime only.
      NOT DONE: the benches are browser benches and cannot run without Chromium.

**Validation**

- [x] The package has one editor runtime.
- [x] The hot path can be explained from input controller to core to scheduler to view without referencing Solid internals.
- [ ] Benchmarks show the rewrite did not regress the guarded scenarios.
      NOT DONE: unverified; the benches did not execute.

**Exit Gate**

- [x] Legacy runtime is gone.
- [x] Public exports are intentionally small.
- [ ] Benchmarks and tests pass on the new path only.
      NOT DONE: 21 of 30 test files pass; the other 9 are browser tests that
      silently skip. `bun run test` in `apps/server` also fails — those tests
      import `bun:test` but the script runs vitest.

---

## Final Done Criteria

- [x] The editor hot path is `DOM event -> command/transaction -> EditorCore -> FrameScheduler -> EditorView`.
- [x] Solid is shell-only for mount/unmount, slow config, and host wiring.
- [x] Text entry is browser-native and IME-safe.
- [x] Async decorations are versioned and disposable.
- [x] Decorations actually render.
      (Verified 2026-08-08 in a browser: keywords, strings, types, operators,
      parameters, and bracket depths all produce correctly classed spans.)
- [ ] Search is synchronous enough to feel immediate.
      NOT DONE: search is not wired to the view.
- [x] Undo behavior is predictable for typing, composition, batch edits, and replace-all.
- [ ] Required browser targets are verified.
      NOT DONE: no browser test has executed on this machine.
- [x] The rewrite ships with the benchmark harness still usable.
