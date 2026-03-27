export type PerfBreakdownEntry = {
	label: string
	duration: number
	children?: PerfBreakdownEntry[]
}

export type PerfRecord = {
	id: string
	name: string
	duration: number
	breakdown: PerfBreakdownEntry[]
	timestamp: number
	metadata?: Record<string, unknown>
}

export type PerfSummary = {
	name: string
	count: number
	totalDuration: number
	avgDuration: number
	minDuration: number
	maxDuration: number
	p95Duration: number
}

export type PerfFilter = {
	name?: string
	since?: number
}

const DEFAULT_MAX_ENTRIES = Infinity

let maxEntries = DEFAULT_MAX_ENTRIES
let records: PerfRecord[] = []

// Callback for notifying listeners when a record is added
type RecordCallback = (record: PerfRecord) => void
let onRecordCallback: RecordCallback | null = null

/**
 * Register a callback to be notified when a performance record is added.
 * Used by devtools to receive real-time performance data.
 */
export const onRecord = (callback: RecordCallback): (() => void) => {
	onRecordCallback = callback
	return () => {
		onRecordCallback = null
	}
}

const generateId = (): string => {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const filterRecords = (filter?: PerfFilter): PerfRecord[] => {
	let result = records

	if (filter?.name) {
		result = result.filter((r) => r.name === filter.name)
	}

	if (filter && typeof filter.since === 'number') {
		const since = filter.since
		result = result.filter((r) => r.timestamp >= since)
	}

	return result
}

const trimIfNeeded = () => {
	if (maxEntries === Infinity) return
	if (maxEntries <= 0) {
		records = []
		return
	}
	if (records.length > maxEntries) {
		records = records.slice(-maxEntries)
	}
}

export const configureMaxEntries = (max: number): void => {
	maxEntries = max
	trimIfNeeded()
}

export const record = (opts: {
	name: string
	duration: number
	breakdown: PerfBreakdownEntry[]
	metadata?: Record<string, unknown>
}): PerfRecord => {
	const { name, duration, breakdown, metadata } = opts
	const newRecord: PerfRecord = {
		id: generateId(),
		name,
		duration,
		breakdown,
		timestamp: Date.now(),
		metadata,
	}

	records.push(newRecord)
	trimIfNeeded()

	// Notify listeners (used by devtools)
	if (onRecordCallback) {
		try {
			onRecordCallback(newRecord)
		} catch {
			// Ignore errors from callback
		}
	}

	return newRecord
}

export const getHistory = (filter?: PerfFilter): ReadonlyArray<PerfRecord> => {
	const filtered = filterRecords(filter)
	return [...filtered]
}

export const clear = (): void => {
	records = []
}

const percentile = (sorted: number[], p: number): number => {
	if (sorted.length === 0) return 0
	const index = Math.ceil((p / 100) * sorted.length) - 1
	return sorted[Math.max(0, index)]!
}

export const getSummary = (filter?: PerfFilter): PerfSummary[] => {
	const history = filterRecords(filter)

	const grouped = new Map<string, number[]>()

	for (const record of history) {
		const durations = grouped.get(record.name) ?? []
		durations.push(record.duration)
		grouped.set(record.name, durations)
	}

	const summaries: PerfSummary[] = []

	for (const [name, durations] of grouped) {
		const sorted = [...durations].sort((a, b) => a - b)
		const total = durations.reduce((sum, d) => sum + d, 0)

		summaries.push({
			name,
			count: durations.length,
			totalDuration: total,
			avgDuration: total / durations.length,
			minDuration: sorted[0]!,
			maxDuration: sorted[sorted.length - 1]!,
			p95Duration: percentile(sorted, 95),
		})
	}

	return summaries.sort((a, b) => b.totalDuration - a.totalDuration)
}

export const getRecentForOperation = (
	name: string,
	limit = 10
): PerfRecord[] => {
	const filtered = records.filter((r) => r.name === name)
	return filtered.slice(-limit)
}

// Export raw data for future server/data lake push
export const exportData = (): PerfRecord[] => {
	return [...records]
}
