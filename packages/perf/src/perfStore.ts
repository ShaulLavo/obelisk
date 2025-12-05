import localforage from 'localforage'

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

type PerfStoreData = {
	records: PerfRecord[]
	version: number
}

const STORAGE_KEY = 'perf-history'
const STORAGE_VERSION = 1
const DEFAULT_MAX_ENTRIES = Infinity

let cachedData: PerfStoreData | null = null
let maxEntries = DEFAULT_MAX_ENTRIES

const generateId = (): string => {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const loadData = async (): Promise<PerfStoreData> => {
	if (cachedData) return cachedData

	try {
		const stored = await localforage.getItem<PerfStoreData>(STORAGE_KEY)
		if (stored && stored.version === STORAGE_VERSION) {
			cachedData = stored
			return cachedData
		}
	} catch {
		// Ignore storage errors
	}

	cachedData = { records: [], version: STORAGE_VERSION }
	return cachedData
}

const saveData = async (data: PerfStoreData): Promise<void> => {
	cachedData = data
	try {
		await localforage.setItem(STORAGE_KEY, data)
	} catch {
		// Ignore storage errors - data is still in memory cache
	}
}

export const configureMaxEntries = (max: number): void => {
	maxEntries = max
}

export const record = async (
	name: string,
	duration: number,
	breakdown: PerfBreakdownEntry[],
	metadata?: Record<string, unknown>
): Promise<PerfRecord> => {
	const data = await loadData()

	const newRecord: PerfRecord = {
		id: generateId(),
		name,
		duration,
		breakdown,
		timestamp: Date.now(),
		metadata
	}

	data.records.push(newRecord)

	// Rolling buffer - remove oldest entries if over limit
	if (data.records.length > maxEntries) {
		data.records = data.records.slice(-maxEntries)
	}

	await saveData(data)
	return newRecord
}

export const getHistory = async (filter?: PerfFilter) => {
	let { records } = await loadData()

	if (filter?.name) {
		records = records.filter(r => r.name === filter.name)
	}

	if (filter?.since) {
		const since = filter.since
		records = records.filter(r => r.timestamp >= since)
	}

	return records as ReadonlyArray<PerfRecord>
}

export const clear = async (): Promise<void> => {
	cachedData = { records: [], version: STORAGE_VERSION }
	await saveData(cachedData)
}

const percentile = (sorted: number[], p: number): number => {
	if (sorted.length === 0) return 0
	const index = Math.ceil((p / 100) * sorted.length) - 1
	return sorted[Math.max(0, index)]!
}

export const getSummary = async (
	filter?: PerfFilter
): Promise<PerfSummary[]> => {
	const records = await getHistory(filter)

	const grouped = new Map<string, number[]>()

	for (const record of records) {
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
			p95Duration: percentile(sorted, 95)
		})
	}

	return summaries.sort((a, b) => b.totalDuration - a.totalDuration)
}

export const getRecentForOperation = async (
	name: string,
	limit = 10
): Promise<PerfRecord[]> => {
	const records = await getHistory({ name })
	return records.slice(-limit)
}

// Export raw data for future server/data lake push
export const exportData = async (): Promise<PerfRecord[]> => {
	const data = await loadData()
	return [...data.records]
}
