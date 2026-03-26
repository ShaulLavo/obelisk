// Main tracking API
export {
	trackOperation,
	trackSync,
	trackMicro,
	createOperationTracker,
	type TimingControls,
} from './perfTracker'

// Store functions
export {
	record,
	getHistory,
	getSummary,
	getRecentForOperation,
	clear,
	exportData,
	configureMaxEntries,
	onRecord,
	type PerfRecord,
	type PerfBreakdownEntry,
	type PerfSummary,
} from './perfStore'

// Logging functions
export {
	logOperation,
	logOperationSimple,
	logSummary,
	logRecentOperations,
	setLogLevel,
	installPerfLoggerDevtools,
} from './perfLogger'

// Global cross-component tracing
export {
	startGlobalTrace,
	markGlobalTrace,
	endGlobalTrace,
	hasGlobalTrace,
} from './globalTrace'
