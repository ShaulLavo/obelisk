import {
	createTimingTracker,
	type TimingControls,
	type TimingTracker
} from '~/utils/timing'
import { PERF_TRACKING_ENABLED } from '~/env'
import { record, type PerfBreakdownEntry, type PerfRecord } from './perfStore'
import { logOperation, logOperationSimple } from './perfLogger'

export type { TimingControls }
export { PERF_TRACKING_ENABLED }

type TrackOptions = {
	metadata?: Record<string, unknown>
	showBreakdown?: boolean
	persist?: boolean
}

// Convert timing tracker's internal format to our breakdown format
const convertBreakdown = (tableOutput: string): PerfBreakdownEntry[] => {
	// Parse the ASCII table output from timing.ts
	// Format: "| label     |   123.45ms |" with label possibly indented
	const lines = tableOutput.split('\n')
	const entries: PerfBreakdownEntry[] = []

	for (const line of lines) {
		// Skip non-data lines (dividers, empty lines, header line)
		if (!line.startsWith('|') || line.startsWith('+-')) continue
		if (line.includes('| step') && line.includes('| duration')) continue

		// Match table rows: "| label | 123.45ms |"
		// Keep leading spaces inside the label so we preserve indentation
		const match = line.match(/^\|\s(.+?)\s*\|\s*([\d.]+)ms\s*\|$/)
		if (match) {
			const rawLabel = match[1]!
			// Skip total and untracked rows - they'll be recalculated
			const trimmedLabel = rawLabel.trim()
			if (trimmedLabel === 'total' || trimmedLabel === 'untracked') continue

			const duration = parseFloat(match[2]!)

			// Preserve the label with its indentation for proper table rendering
			entries.push({
				label: rawLabel.trimEnd(), // Keep leading spaces, trim trailing
				duration,
				children: []
			})
		}
	}

	return entries
}

// No-op controls for when tracking is disabled
const noopControls: TimingControls = {
	timeSync: (_label, fn) => fn(noopControls),
	timeAsync: (_label, fn) => fn(noopControls)
}

/**
 * Track an async operation with timing and optional persistence
 */
export const trackOperation = async <T>(
	name: string,
	fn: (controls: TimingControls) => Promise<T>,
	options: TrackOptions = {}
): Promise<T> => {
	// Early return when tracking disabled - allows tree-shaking
	if (!PERF_TRACKING_ENABLED) {
		return fn(noopControls)
	}

	const { metadata, showBreakdown = true, persist = true } = options

	const tracker = createTimingTracker()
	const { timeSync, timeAsync } = tracker

	try {
		const result = await fn({ timeSync, timeAsync })
		return result
	} finally {
		const duration = tracker.getTotalDuration()
		const tableOutput = tracker.formatTable()
		const breakdown = convertBreakdown(tableOutput)

		if (persist) {
			const perfRecord = await record(name, duration, breakdown, metadata)
			logOperation(perfRecord, { showBreakdown })
		} else {
			logOperationSimple(name, duration, metadata)
		}
	}
}

/**
 * Track a sync operation with timing and optional persistence
 */
export const trackSync = <T>(
	name: string,
	fn: (controls: TimingControls) => T,
	options: TrackOptions = {}
): T => {
	// Early return when tracking disabled - allows tree-shaking
	if (!PERF_TRACKING_ENABLED) {
		return fn(noopControls)
	}

	const { metadata, showBreakdown = true, persist = true } = options

	const tracker = createTimingTracker()
	const { timeSync, timeAsync } = tracker

	try {
		const result = fn({ timeSync, timeAsync })
		return result
	} finally {
		const duration = tracker.getTotalDuration()
		const tableOutput = tracker.formatTable()
		const breakdown = convertBreakdown(tableOutput)

		if (persist) {
			// Fire-and-forget for sync operations
			void record(name, duration, breakdown, metadata).then(perfRecord => {
				logOperation(perfRecord, { showBreakdown })
			})
		} else {
			logOperationSimple(name, duration, metadata)
		}
	}
}

/**
 * Lightweight timing for high-frequency operations
 * Uses performance.now() directly with minimal overhead
 * Does not persist by default - use for keystroke-level tracking
 */
export const trackMicro = <T>(
	name: string,
	fn: () => T,
	options: { metadata?: Record<string, unknown>; threshold?: number } = {}
): T => {
	// Early return when tracking disabled - allows tree-shaking
	if (!PERF_TRACKING_ENABLED) {
		return fn()
	}

	const { metadata, threshold = 1 } = options
	const start = performance.now()

	try {
		return fn()
	} finally {
		const duration = performance.now() - start
		// Only log if duration exceeds threshold (default 1ms)
		if (duration >= threshold) {
			logOperationSimple(name, duration, metadata)
		}
	}
}

/**
 * Create a reusable tracker for a specific operation type
 * Useful for wrapping functions that are called frequently
 */
export const createOperationTracker = (
	operationName: string,
	defaultOptions: TrackOptions = {}
) => ({
	track: <T>(
		fn: (controls: TimingControls) => Promise<T>,
		options?: TrackOptions
	) => trackOperation(operationName, fn, { ...defaultOptions, ...options }),

	trackSync: <T>(fn: (controls: TimingControls) => T, options?: TrackOptions) =>
		trackSync(operationName, fn, { ...defaultOptions, ...options }),

	trackMicro: <T>(
		fn: () => T,
		options?: { metadata?: Record<string, unknown>; threshold?: number }
	) => trackMicro(operationName, fn, options)
})

// Re-export store functions for convenience
export {
	getSummary,
	getHistory,
	clear,
	exportData,
	getRecentForOperation
} from './perfStore'
export { logSummary, logRecentOperations, setLogLevel } from './perfLogger'
