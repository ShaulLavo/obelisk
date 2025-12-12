import type {
	BenchProgressPayload,
	BenchScenario,
	BenchScenarioResultsPayload
} from './types'

const HISTORY_LIMIT = 512

export type StoreBenchEventBase =
	| { type: 'reset' }
	| { type: 'manifest'; payload: { scenarios: BenchScenario[] } }
	| { type: 'progress'; payload: BenchProgressPayload }
	| { type: 'scenario-complete'; payload: BenchScenarioResultsPayload }
	| { type: 'results'; payload: BenchScenarioResultsPayload[] }
	| { type: 'skipped'; reason?: string }
	| { type: 'error'; error: Error }

export type StoreBenchEvent = StoreBenchEventBase & { timestamp: number }

type Listener = (event: StoreBenchEvent) => void

const listeners = new Set<Listener>()
const history: StoreBenchEvent[] = []

const addToHistory = (event: StoreBenchEvent) => {
	if (event.type === 'reset') {
		history.length = 0
		history.push(event)
		return
	}

	history.push(event)
	if (history.length > HISTORY_LIMIT) {
		history.shift()
	}
}

export const emitStoreBenchEvent = (
	event: StoreBenchEventBase
): StoreBenchEvent => {
	const timedEvent: StoreBenchEvent = {
		...event,
		timestamp: Date.now()
	}
	addToHistory(timedEvent)
	for (const listener of listeners) {
		listener(timedEvent)
	}
	return timedEvent
}

export const subscribeStoreBenchEvents = (
	listener: Listener,
	options?: { replay?: boolean }
): (() => void) => {
	const replay = options?.replay ?? true
	if (replay) {
		for (const event of history) {
			listener(event)
		}
	}
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export const getStoreBenchEventHistory = (): StoreBenchEvent[] => [...history]
