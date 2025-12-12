import type {
	BenchProgressPayload,
	BenchScenario,
	BenchScenarioResultsPayload,
} from './types'
export type StoreBenchEventBase =
	| {
			type: 'reset'
	  }
	| {
			type: 'manifest'
			payload: {
				scenarios: BenchScenario[]
			}
	  }
	| {
			type: 'progress'
			payload: BenchProgressPayload
	  }
	| {
			type: 'scenario-complete'
			payload: BenchScenarioResultsPayload
	  }
	| {
			type: 'results'
			payload: BenchScenarioResultsPayload[]
	  }
	| {
			type: 'skipped'
			reason?: string
	  }
	| {
			type: 'error'
			error: Error
	  }
export type StoreBenchEvent = StoreBenchEventBase & {
	timestamp: number
}
type Listener = (event: StoreBenchEvent) => void
export declare const emitStoreBenchEvent: (
	event: StoreBenchEventBase
) => StoreBenchEvent
export declare const subscribeStoreBenchEvents: (
	listener: Listener,
	options?: {
		replay?: boolean
	}
) => () => void
export declare const getStoreBenchEventHistory: () => StoreBenchEvent[]
export {}
//# sourceMappingURL=storeBenchEvents.d.ts.map
