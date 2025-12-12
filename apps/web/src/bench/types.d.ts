export type BenchValueKind = 'text' | 'arrayBuffer'
export type BenchScenarioCategory = 'store' | 'raw-binary'
export type BenchScenario = {
	name: string
	items: number
	valueBytes: number
	order: 'sequential' | 'random'
	valueKind?: BenchValueKind
	category?: BenchScenarioCategory
	chunkBytes?: number
	operations?: number
	addressSpaceBytes?: number
	runsPerAdapter?: number
}
export type BenchScenarioResult = {
	store: string
	items: number
	valueBytes: number
	writeMs: number
	readMs: number
	removeMs: number
	totalMs: number
}
export type BenchScenarioResultsPayload = {
	scenario: BenchScenario
	results: BenchScenarioResult[]
	durationMs?: number
}
export type BenchProgressKind =
	| 'run-start'
	| 'run-complete'
	| 'scenario-start'
	| 'scenario-complete'
	| 'adapter-start'
	| 'adapter-complete'
export type BenchProgressPayload = {
	kind: BenchProgressKind
	message: string
	scenario?: BenchScenario
	adapter?: string
}
export type WorkerManifestMessage = {
	type: 'manifest'
	payload: {
		scenarios: BenchScenario[]
	}
}
export type WorkerProgressMessage = {
	type: 'progress'
	payload: BenchProgressPayload
}
export type WorkerScenarioCompleteMessage = {
	type: 'scenario-complete'
	payload: BenchScenarioResultsPayload
}
export type WorkerResultsMessage = {
	type: 'results'
	payload: BenchScenarioResultsPayload[]
}
export type WorkerSkippedMessage = {
	type: 'skipped'
	reason?: string
}
export type WorkerErrorMessage = {
	type: 'error'
	error: string
}
export type WorkerMessage =
	| WorkerManifestMessage
	| WorkerProgressMessage
	| WorkerScenarioCompleteMessage
	| WorkerResultsMessage
	| WorkerSkippedMessage
	| WorkerErrorMessage
//# sourceMappingURL=types.d.ts.map
