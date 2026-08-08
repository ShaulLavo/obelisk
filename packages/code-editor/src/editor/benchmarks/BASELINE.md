# Editor Pipeline Rewrite — Benchmark Baseline

## How to Run

```bash
# Run all browser benchmarks (typing + canary):
bunx vitest bench --project browser packages/code-editor/src/editor/benchmarks/

# Run only the canary trace:
bunx vitest bench --project browser packages/code-editor/src/editor/benchmarks/canary.browser.bench.tsx

# Run only the typing benchmarks:
bunx vitest bench --project browser packages/code-editor/src/editor/benchmarks/typing.browser.bench.tsx
```

## Fixture Classes

| Fixture | Lines | Chars/Line | Purpose |
|---------|-------|-----------|---------|
| `small` | 100 | 80 | Baseline comparison, minimal overhead |
| `large` | 10,000 | 80 | Vertical virtualization stress |
| `highlight-heavy` | ~500 | 80 | Dense syntax decoration pipeline |
| `long-line` | 200 | 5,000 | Horizontal virtualization pathological case |

## Canary Trace

The canary trace is a deterministic sequence of edits replayed identically on every run.
It covers: typing, newlines, backspace, and burst typing.

Total keystrokes per canary run: see `CANARY_KEYSTROKE_COUNT` in `canaryTrace.ts`.

## Pipeline Timing Marks

When instrumented, the timing session tracks these stages per keystroke:

| Mark | Description |
|------|-------------|
| `input-received` | Browser event arrives at input handler |
| `transaction-start` | Core dispatch begins |
| `transaction-end` | Core dispatch commits |
| `frame-requested` | RAF scheduled |
| `frame-flush-start` | View flush begins |
| `frame-flush-end` | View flush completes (paint) |

## Pipeline Counters

| Counter | Description |
|---------|-------------|
| `rowsUpdated` | Number of DOM rows updated per flush |
| `overlayUpdated` | Number of overlay (cursor/selection) updates |
| `staleWorkerDiscard` | Stale async decoration snapshots discarded |
| `longLineActivations` | Times long-line mode was activated |
| `cacheMemoryEstimate` | Estimated bytes in line caches |

## Baseline Results

_Results will be recorded here after the first baseline run._

```
Phase 0 baseline — [date]
[paste output here]
```
