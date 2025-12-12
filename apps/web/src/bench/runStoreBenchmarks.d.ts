import type {
	BenchProgressPayload,
	BenchScenario,
	BenchScenarioResultsPayload,
} from './types'
export type RunStoreBenchmarksHandlers = {
	onManifest?(scenarios: BenchScenario[]): void
	onScenarioComplete?(payload: BenchScenarioResultsPayload): void
	onProgress?(payload: BenchProgressPayload): void
	onComplete?(payload: BenchScenarioResultsPayload[]): void
	onSkipped?(reason?: string): void
	onError?(error: Error): void
}
export declare const formatNumber: (value: number, digits?: number) => number
export declare const runStoreBenchmarks: (
	handlers?: RunStoreBenchmarksHandlers
) => Promise<void>
//# sourceMappingURL=runStoreBenchmarks.d.ts.map
