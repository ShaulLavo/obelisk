// Main tracking API
export {
	trackOperation,
	trackSync,
	trackMicro,
	createOperationTracker,
	type TimingControls
} from './perfTracker'
export { PERF_TRACKING_ENABLED } from './config'

// Store functions
export {
	record,
	getHistory,
	getSummary,
	getRecentForOperation,
	clear,
	exportData,
	configureMaxEntries,
	type PerfRecord,
	type PerfBreakdownEntry,
	type PerfSummary
} from './perfStore'

// Logging functions
export {
	logOperation,
	logOperationSimple,
	logSummary,
	logRecentOperations,
	setLogLevel
} from './perfLogger'

export { perfEnv, type PerfEnv } from './env'
