/**
 * makeWorkerBridge — bridges the editor core to the tree-sitter/syntax worker.
 *
 * Responsibilities:
 * - send document changes to the worker
 * - receive decoration snapshots
 * - queue coalescing: only send the latest version
 * - health timeout / crash detection / restart
 * - clear decorations when worker is unhealthy
 *
 * Framework-free. No Solid, no DOM.
 */

import type { EditorCore, DocumentIdentity, EditorDirtyState } from '../core/types'
import {
	type DecorationStore,
	type DecorationStoreSnapshot,
} from '../core/decorations/makeDecorationStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkerMessage =
	| { type: 'parse'; identity: DocumentIdentity; docVersion: number; text: string }
	| { type: 'ping' }

export type WorkerResponse =
	| { type: 'decorations'; snapshot: DecorationStoreSnapshot }
	| { type: 'pong' }
	/**
	 * Sent as soon as a parse request is received, before the work starts.
	 * Distinguishes "busy" from "dead" — the first parse has to load and compile
	 * the grammar WASM, which legitimately takes seconds.
	 */
	| { type: 'ack' }

export type WorkerBridgeConfig = {
	core: EditorCore
	decorationStore: DecorationStore
	/** Factory to create/restart the worker. */
	createWorker: () => Worker
	/** Health timeout in ms. Default: 5000. */
	healthTimeoutMs?: number
	/** Ping interval in ms. Default: 10000. */
	pingIntervalMs?: number
	/**
	 * Called when the worker fails to start, errors, or stops responding.
	 * Decorations silently disappear on failure, so without this a missing
	 * highlight is indistinguishable from a file that has none.
	 */
	onError?: (reason: string, detail?: unknown) => void
}

export type WorkerBridge = {
	/** Notify the bridge that the document changed. Queues a worker request. */
	notifyChange(dirty: EditorDirtyState): void
	/** Force an immediate parse request (e.g., after document replacement). */
	requestParse(): void
	/** Whether the worker is currently healthy. */
	isHealthy(): boolean
	/** Tear down. */
	destroy(): void
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Generous because the first parse includes fetching and compiling the grammar
 * WASM, and several editors may be doing it at once. The worker acks on receipt,
 * so a live-but-busy worker keeps this timer reset regardless.
 */
const DEFAULT_HEALTH_TIMEOUT_MS = 30000
const DEFAULT_PING_INTERVAL_MS = 10000

export const makeWorkerBridge = (config: WorkerBridgeConfig): WorkerBridge => {
	const {
		core,
		decorationStore,
		createWorker,
		healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
		pingIntervalMs = DEFAULT_PING_INTERVAL_MS,
	} = config

	const reportError = (reason: string, detail?: unknown) => {
		if (config.onError) {
			config.onError(reason, detail)
			return
		}
		console.warn(`[editor] syntax worker ${reason}; highlighting is off`, detail)
	}

	let worker: Worker | null = null
	let destroyed = false
	let healthy = true
	let pendingVersion: number | null = null
	let lastSentVersion = -1
	let healthTimer: ReturnType<typeof setTimeout> | null = null
	let pingTimer: ReturnType<typeof setInterval> | null = null
	let coalesceTimer: ReturnType<typeof setTimeout> | null = null

	const startWorker = () => {
		if (destroyed) return
		try {
			worker = createWorker()
			worker.onmessage = onWorkerMessage
			worker.onerror = onWorkerError
			healthy = true
			startPingTimer()
		} catch (error) {
			healthy = false
			decorationStore.clear()
			reportError('failed to start', error)
		}
	}

	const restartWorker = () => {
		stopTimers()
		try {
			worker?.terminate()
		} catch {
			// ignore
		}
		worker = null
		healthy = false
		decorationStore.clear()
		// The fresh worker has no idea what we last sent. Without clearing this,
		// sendParse's dedupe check drops the retry and the document is never
		// parsed again — decorations stay cleared until the next edit.
		lastSentVersion = -1
		startWorker()
		// Re-send the current document
		requestParse()
	}

	const sendParse = () => {
		if (!worker || destroyed) return
		const snapshot = core.getSnapshot()
		const version = snapshot.versions.docVersion

		if (version === lastSentVersion) return

		lastSentVersion = version
		pendingVersion = null

		const text = core.getTextRange(0, core.getDocumentLength())
		const message: WorkerMessage = {
			type: 'parse',
			identity: snapshot.identity,
			docVersion: version,
			text,
		}
		worker.postMessage(message)
		resetHealthTimer()
	}

	const requestParse = () => {
		if (destroyed) return
		sendParse()
	}

	const onWorkerMessage = (e: MessageEvent<WorkerResponse>) => {
		if (destroyed) return
		resetHealthTimer()
		healthy = true

		const response = e.data
		if (response.type === 'decorations') {
			const snapshot = core.getSnapshot()
			const doc = snapshot.document

			// Promote current to fallback before applying new
			decorationStore.promoteFallback()

			const affected = decorationStore.apply(
				response.snapshot,
				snapshot.identity,
				snapshot.versions.docVersion,
				doc.lineStarts,
				doc.lineIds
			)

			if (affected && affected.length > 0) {
				// Notify the core to trigger a repaint for affected lines
				core.applyDecorations({
					identity: response.snapshot.identity,
					docVersion: response.snapshot.docVersion,
					syntax: [],
					errors: [],
					affectedLineIds: affected,
				})
			}
		}
	}

	const onWorkerError = (event: ErrorEvent | Event) => {
		healthy = false
		decorationStore.clear()
		reportError('errored', (event as ErrorEvent)?.message ?? event)
		// Attempt restart after a delay
		setTimeout(() => {
			if (!destroyed) restartWorker()
		}, 1000)
	}

	const resetHealthTimer = () => {
		if (healthTimer) clearTimeout(healthTimer)
		healthTimer = setTimeout(() => {
			if (!destroyed) {
				healthy = false
				decorationStore.clear()
				reportError(`stopped responding after ${healthTimeoutMs}ms`)
				restartWorker()
			}
		}, healthTimeoutMs)
	}

	const startPingTimer = () => {
		if (pingTimer) clearInterval(pingTimer)
		pingTimer = setInterval(() => {
			if (worker && !destroyed) {
				worker.postMessage({ type: 'ping' } satisfies WorkerMessage)
				resetHealthTimer()
			}
		}, pingIntervalMs)
	}

	const stopTimers = () => {
		if (healthTimer) { clearTimeout(healthTimer); healthTimer = null }
		if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
		if (coalesceTimer) { clearTimeout(coalesceTimer); coalesceTimer = null }
	}

	// Start the worker
	startWorker()

	return {
		notifyChange(dirty) {
			if (destroyed || !dirty.text) return

			// Coalesce: wait a microtask to batch rapid mutations
			if (coalesceTimer) clearTimeout(coalesceTimer)
			coalesceTimer = setTimeout(() => {
				coalesceTimer = null
				sendParse()
			}, 4) // ~one frame budget
		},

		requestParse,

		isHealthy() {
			return healthy
		},

		destroy() {
			if (destroyed) return
			destroyed = true
			stopTimers()
			try {
				worker?.terminate()
			} catch {
				// ignore
			}
			worker = null
		},
	}
}
