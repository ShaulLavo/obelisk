/**
 * Pipeline timing marks for measuring editor hot-path stages.
 *
 * These marks instrument the keypress-to-paint pipeline at each stage
 * defined in the RFC:
 *
 *   input-received → transaction-start → transaction-end →
 *   frame-requested → frame-flush-start → frame-flush-end
 *
 * Counters track aggregate metrics across a measurement session:
 *   rows-updated, overlay-updated, stale-worker-discard,
 *   long-line-activations, cache-memory-estimate
 */

// ---------------------------------------------------------------------------
// Mark names
// ---------------------------------------------------------------------------

export const MARK = {
	INPUT_RECEIVED: 'editor:input-received',
	TRANSACTION_START: 'editor:transaction-start',
	TRANSACTION_END: 'editor:transaction-end',
	FRAME_REQUESTED: 'editor:frame-requested',
	FRAME_FLUSH_START: 'editor:frame-flush-start',
	FRAME_FLUSH_END: 'editor:frame-flush-end',
} as const

export type MarkName = (typeof MARK)[keyof typeof MARK]

// ---------------------------------------------------------------------------
// Counter state
// ---------------------------------------------------------------------------

export type PipelineCounters = {
	rowsUpdated: number
	overlayUpdated: number
	staleWorkerDiscard: number
	longLineActivations: number
	cacheMemoryEstimate: number
}

const createEmptyCounters = (): PipelineCounters => ({
	rowsUpdated: 0,
	overlayUpdated: 0,
	staleWorkerDiscard: 0,
	longLineActivations: 0,
	cacheMemoryEstimate: 0,
})

// ---------------------------------------------------------------------------
// Timing session
// ---------------------------------------------------------------------------

export type PipelineTimingEntry = {
	inputToTransactionStart: number
	transactionDuration: number
	transactionEndToFrameRequest: number
	frameFlushDuration: number
	inputToFlushEnd: number
}

export type TimingSession = {
	mark(name: MarkName): void
	incrementCounter(key: keyof PipelineCounters, delta?: number): void
	setCounter(key: keyof PipelineCounters, value: number): void
	/** Collect one complete pipeline entry from accumulated marks. Returns null if marks are incomplete. */
	collectEntry(): PipelineTimingEntry | null
	getCounters(): PipelineCounters
	reset(): void
}

/**
 * Create a timing session for measuring editor pipeline stages.
 *
 * Uses `performance.mark()` under the hood for high-resolution timestamps.
 * Each `collectEntry()` call reads and clears the latest mark set.
 */
export const createTimingSession = (): TimingSession => {
	const marks = new Map<MarkName, number>()
	const counters = createEmptyCounters()

	const mark = (name: MarkName) => {
		marks.set(name, performance.now())
	}

	const incrementCounter = (key: keyof PipelineCounters, delta = 1) => {
		counters[key] += delta
	}

	const setCounter = (key: keyof PipelineCounters, value: number) => {
		counters[key] = value
	}

	const collectEntry = (): PipelineTimingEntry | null => {
		const inputReceived = marks.get(MARK.INPUT_RECEIVED)
		const txStart = marks.get(MARK.TRANSACTION_START)
		const txEnd = marks.get(MARK.TRANSACTION_END)
		const frameRequested = marks.get(MARK.FRAME_REQUESTED)
		const flushStart = marks.get(MARK.FRAME_FLUSH_START)
		const flushEnd = marks.get(MARK.FRAME_FLUSH_END)

		if (
			inputReceived === undefined ||
			txStart === undefined ||
			txEnd === undefined ||
			flushEnd === undefined
		) {
			return null
		}

		const entry: PipelineTimingEntry = {
			inputToTransactionStart: txStart - inputReceived,
			transactionDuration: txEnd - txStart,
			transactionEndToFrameRequest:
				frameRequested !== undefined ? frameRequested - txEnd : 0,
			frameFlushDuration:
				flushStart !== undefined && flushEnd !== undefined
					? flushEnd - flushStart
					: 0,
			inputToFlushEnd: flushEnd - inputReceived,
		}

		// Clear marks for the next pipeline cycle
		marks.clear()

		return entry
	}

	const getCounters = (): PipelineCounters => ({ ...counters })

	const reset = () => {
		marks.clear()
		Object.assign(counters, createEmptyCounters())
	}

	return { mark, incrementCounter, setCounter, collectEntry, getCounters, reset }
}

// ---------------------------------------------------------------------------
// Summarization
// ---------------------------------------------------------------------------

export type TimingSummary = {
	count: number
	inputToTransactionStart: { mean: number; p50: number; p95: number }
	transactionDuration: { mean: number; p50: number; p95: number }
	frameFlushDuration: { mean: number; p50: number; p95: number }
	inputToFlushEnd: { mean: number; p50: number; p95: number }
}

const percentile = (sorted: number[], p: number): number => {
	if (sorted.length === 0) return 0
	const index = (p / 100) * (sorted.length - 1)
	const lower = Math.floor(index)
	const upper = Math.ceil(index)
	if (lower === upper) return sorted[lower]!
	const fraction = index - lower
	return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction
}

const summarizeField = (
	entries: PipelineTimingEntry[],
	field: keyof PipelineTimingEntry
) => {
	const values = entries.map((e) => e[field]).sort((a, b) => a - b)
	const sum = values.reduce((a, b) => a + b, 0)
	return {
		mean: values.length > 0 ? sum / values.length : 0,
		p50: percentile(values, 50),
		p95: percentile(values, 95),
	}
}

export const summarizeTimings = (
	entries: PipelineTimingEntry[]
): TimingSummary => ({
	count: entries.length,
	inputToTransactionStart: summarizeField(entries, 'inputToTransactionStart'),
	transactionDuration: summarizeField(entries, 'transactionDuration'),
	frameFlushDuration: summarizeField(entries, 'frameFlushDuration'),
	inputToFlushEnd: summarizeField(entries, 'inputToFlushEnd'),
})

export const formatTimingSummary = (summary: TimingSummary): string => {
	const fmt = (stats: { mean: number; p50: number; p95: number }) =>
		`mean=${stats.mean.toFixed(2)}ms p50=${stats.p50.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms`

	return [
		`Pipeline timing (${summary.count} entries):`,
		`  input→tx-start:  ${fmt(summary.inputToTransactionStart)}`,
		`  transaction:     ${fmt(summary.transactionDuration)}`,
		`  frame flush:     ${fmt(summary.frameFlushDuration)}`,
		`  input→flush-end: ${fmt(summary.inputToFlushEnd)}`,
	].join('\n')
}
