import type { Logger } from '@repo/logger'
import { createTimingTracker, type TimingControls } from './timing'
import { record, type PerfBreakdownEntry, type PerfRecord } from './perfStore'
import { logOperation, logOperationSimple } from './perfLogger'

export type { TimingControls }

type TrackOptions = {
	metadata?: Record<string, unknown>
	showBreakdown?: boolean
	persist?: boolean
	level?: 'debug' | 'info' | 'warn'
	logger?: Logger
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

const createTransientRecord = (
	name: string,
	duration: number,
	breakdown: PerfBreakdownEntry[],
	metadata?: Record<string, unknown>
): PerfRecord => ({
	id: `transient-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
	name,
	duration,
	breakdown,
	timestamp: Date.now(),
	metadata
})

/**
 * Track an async operation with timing and optional persistence
 */
export const trackOperation = async <T>(
	name: string,
	fn: (controls: TimingControls) => Promise<T>,
	options: TrackOptions = {}
): Promise<T> => {
	const {
		metadata,
		showBreakdown = true,
		persist = true,
		level,
		logger
	} = options

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
			logOperation(perfRecord, { showBreakdown, level, logger })
		} else {
			const perfRecord = createTransientRecord(
				name,
				duration,
				breakdown,
				metadata
			)
			logOperation(perfRecord, { showBreakdown, level, logger })
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
	const {
		metadata,
		showBreakdown = true,
		persist = true,
		level,
		logger
	} = options

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
				logOperation(perfRecord, { showBreakdown, level, logger })
			})
		} else {
			const perfRecord = createTransientRecord(
				name,
				duration,
				breakdown,
				metadata
			)
			logOperation(perfRecord, { showBreakdown, level, logger })
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
	options: {
		metadata?: Record<string, unknown>
		threshold?: number
		logger?: Logger
	} = {}
): T => {
	const { metadata, threshold = 1, logger } = options
	const start = performance.now()

	try {
		return fn()
	} finally {
		const duration = performance.now() - start
		// Only log if duration exceeds threshold (default 1ms)
		if (duration >= threshold) {
			logOperationSimple(name, duration, metadata, { logger })
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
		options?: {
			metadata?: Record<string, unknown>
			threshold?: number
			logger?: Logger
		}
	) => {
		const mergedOptions = { ...defaultOptions, ...options }
		return trackMicro(operationName, fn, mergedOptions)
	}
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
