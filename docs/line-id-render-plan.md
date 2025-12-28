# Line-ID Render Refactor Plan (TS newline rerender)

## Summary

We confirmed the rerender on newline is driven by line shifts: a newline causes
many visible lines to change lineIndex/lineStart, which forces LineRow/Syntax/
highlight work across the visible window. This is most visible in TS/JS because
highlight payloads are heavier.

This plan introduces a line-id based rendering pipeline that keeps line content
stable across lineIndex shifts, so the DOM only updates for the affected lines.

## Goals

- Prevent full visible-row rerender on newline + char by decoupling rendering
  from lineIndex and lineStart shifts.
- Keep correctness for text, highlights, brackets, selection, gutters.
- Preserve or improve performance (no new O(n) per edit in hot path).
- Keep logs and debug tools opt-in during refactor; remove afterward.

## Non-goals

- No backward-compat behavior (greenfield).
- No new UI behavior or formatting changes.
- Do not optimize tree-sitter parsing in this pass.

## Root Cause (confirmed)

- On newline, lineIdChanges.indexChanged/startChanged spikes across visible
  rows. This is normal lineIndex/lineStart shifting but currently used as
  reactive inputs for rendering, causing mass updates.

## High-Level Approach

1. Introduce a line-id data model that stores per-line content by lineId.
2. Render lines by lineId, not by lineIndex. Keep lineIndex only for input,
   cursor, and display (line numbers).
3. Update highlight caches to be lineId-stable, so lineStart shifts do not
   invalidate unchanged line segments.
4. Update selection/whitespace rendering to resolve lineIndex from lineId.
5. Remove debug logs once validated.

---

## Phase 0: Pre-work and safeguards

- Keep existing logs until we validate line-id rendering.
- Add a single feature guard (if needed) to flip line-id rendering on/off for
  quick comparison during the refactor.
- Document any performance regressions with trackMicro before/after.

---

## Phase 1: Line Data Model (Cursor Context)

### 1.1 Data structures

Create a line-id table in CursorContext:

- lineIds: number[] (ordered, current document order)
- lineById: Map<number, LineData>

LineData should include:

- text: string
- length: number
- start: number (line start offset; used for cursor/selection)
- revision: number (optional, for stable memo keys)

### 1.2 API surface (CursorContext)

Add read helpers that use lineId:

- getLineId(lineIndex) -> number
- getLineIndex(lineId) -> number
- getLineTextById(lineId) -> string
- getLineLengthById(lineId) -> number
- getLineStartById(lineId) -> number

Keep existing lineIndex-based APIs for cursor math; they should use the same
underlying data to avoid divergence.

### 1.3 Edit handling

Update applyEdit to:

- compute affected lineId range
- update lineById only for the affected lineId(s)
- create new lineId(s) for inserted lines
- avoid touching lineById entries for untouched lines
- update lineIds order
- update lineStarts as usual (cursor math depends on it)
- update only start for lineIds after the edit (fast loop; non-reactive if we
  store starts in a Map)

Key idea: only content changes for edited line(s); shifts only update start.

---

## Phase 2: Rendering by lineId (LineRow / Virtual Rows)

### 2.1 Virtualizer (already keyed by lineId)

- Keep getLineId in create2DVirtualizer.
- Ensure virtual items always include lineId (already done).

### 2.2 LineRow content lookup

Update LineRow to:

- resolve lineId from virtualRow.lineId
- fetch text/length via cursor.lines.getLineTextById/LengthById
- use lineIndex only for:
  - gutter line number
  - click/mouse events
  - selection/cursor placement

### 2.3 LineEntry model

Extend LineEntry to include lineId.
Use lineId as the stable key for highlight caches and line memo equality.

### 2.4 Entry equality strategy

Only recompute rendering when:

- text changes
- length changes
- highlights/brackets change

Do not invalidate when only lineIndex or start changes.

---

## Phase 3: Highlight pipeline (lineId-stable)

### 3.1 Cache by lineId

Replace cache keys from lineIndex to lineId in createLineHighlights.
Add a lineId -> lineIndex resolver to map highlight ranges when needed.

### 3.2 Offset strategy

- If a line is not intersecting offsets, reuse cached segments even when start
  shifts.
- Only invalidate when:
  - text/length changes for that lineId
  - offset intersects that lineId’s range

### 3.3 Precomputed segments

- Store precomputed segments by lineId.
- When line order changes, do not recompute unless text changed.

---

## Phase 4: Selection and whitespace rendering

### 4.1 Selection rects

Update useSelectionRects to resolve lineIndex via lineId before reading
lineStarts/text. Use virtualRow.lineId instead of virtualRow.index.

### 4.2 Whitespace markers

Update useWhitespaceMarkers with the same lineId resolution.

---

## Phase 5: Validation and tests

### 5.1 Manual validations

- TS file:
  - type "h", "space", "h", newline, "h"
  - verify no full visible rerender (LineRow mounts/cleanups stable)
  - verify highlights remain correct

### 5.2 Tests (existing infra)

- Add a browser test asserting:
  - newline does not exceed mount/cleanup budget
  - only edited line’s text runs update
- Keep tests close to LineRow.highlightOffsets.browser.test.tsx.

### 5.3 Perf checks

- Compare keystroke:render before/after for TS file.

---

## Phase 6: Cleanup

- Remove temporary debug logs:
  - TextEditorView visible shift log
  - create2DVirtualizer mismatch log
  - LineRow column mismatch log
- Remove columnEndOverride safety once lineId pipeline is stable.
- If lineId is only used for debugging/transition, remove lineId from:
  - VirtualItem2D and create2DVirtualizer
  - CursorContext line-id helpers
  - LineEntry/LineRow/LineGutterItem props
  - Any remaining lineId-based caches

---

## Risks and mitigations

- Risk: lineId mapping bugs break cursor/selection.
  - Mitigation: keep lineStarts in sync, add invariant logs for lineId->index.
- Risk: highlight cache returns stale segments.
  - Mitigation: lineId keyed invalidation by text/length revision.
- Risk: performance regression from Map lookups.
  - Mitigation: cache hot lookups per frame, avoid deep loops in render.

---

## Rollback plan

- Revert to the current lineIndex-based rendering if correctness regresses.
- Keep lineId data model changes isolated to CursorContext; toggle via a flag.

---

## Open questions

- Should we store line text in lineById or keep it lazy via piece table?
- Do we want a LineRevision counter to drive highlight caches?
- Are we OK with a temporary feature flag to switch old/new rendering?
