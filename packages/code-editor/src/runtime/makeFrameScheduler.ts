/**
 * makeFrameScheduler — the single coordinator for paint timing.
 *
 * Coalesces dirty notifications from EditorCore into one RAF flush.
 * No subsystem schedules its own RAF for normal editor paint — everything
 * goes through this scheduler.
 *
 * The scheduler subscribes to EditorCore.onDidChange and accumulates dirty
 * state. On each RAF, it calls the FlushTarget callback with the merged
 * dirty state and emits the resulting FlushReceipt to listeners.
 *
 * Framework-free. No Solid, no DOM (except requestAnimationFrame).
 */

import type {
	EditorCore,
	EditorDirtyState,
	FlushReason,
	FlushReceipt,
	FlushTarget,
	FrameScheduler,
} from '../core/types'
import { createEmptyDirty, mergeDirty } from '../core/dirty'
import { nowMicros, elapsedMicros } from './performance'

export type FrameSchedulerConfig = {
	/** The EditorCore to subscribe to. */
	core: EditorCore
	/** The flush target callback invoked on each RAF. */
	flushTarget: FlushTarget
	/**
	 * Override for requestAnimationFrame (for testing).
	 * Defaults to globalThis.requestAnimationFrame.
	 */
	requestAnimationFrame?: (cb: FrameRequestCallback) => number
	/**
	 * Override for cancelAnimationFrame (for testing).
	 * Defaults to globalThis.cancelAnimationFrame.
	 */
	cancelAnimationFrame?: (id: number) => void
}

export const makeFrameScheduler = (config: FrameSchedulerConfig): FrameScheduler => {
	const { core, flushTarget } = config
	const raf = config.requestAnimationFrame ?? globalThis.requestAnimationFrame.bind(globalThis)
	const caf = config.cancelAnimationFrame ?? globalThis.cancelAnimationFrame.bind(globalThis)

	let pendingDirty: EditorDirtyState | null = null
	let rafId: number | null = null
	let destroyed = false

	const flushListeners: Array<(receipt: FlushReceipt) => void> = []

	const scheduleTick = () => {
		if (rafId !== null || destroyed) return
		rafId = raf(onFrame)
	}

	const onFrame = (_timestamp: number) => {
		rafId = null
		flush()
	}

	const flush = (): FlushReceipt | null => {
		if (!pendingDirty || destroyed) return null

		const dirty = pendingDirty
		pendingDirty = null

		const startTime = nowMicros()
		const receipt = flushTarget(dirty)
		receipt.durationMicros = elapsedMicros(startTime)

		for (const listener of flushListeners) {
			listener(receipt)
		}

		return receipt
	}

	const onCoreChange = (dirty: EditorDirtyState) => {
		if (destroyed) return

		if (pendingDirty) {
			pendingDirty = mergeDirty(pendingDirty, dirty)
		} else {
			pendingDirty = { ...dirty }
		}

		scheduleTick()
	}

	// Subscribe to core dirty notifications
	const unsubscribeCore = core.onDidChange(onCoreChange)

	return {
		requestFlush(reason: FlushReason) {
			if (destroyed) return

			// Map reason to a minimal dirty patch and merge it in.
			// This is for external callers (resize, scroll) that want to
			// request a flush without going through EditorCore.dispatch.
			const snapshot = core.getSnapshot()
			const empty = createEmptyDirty(snapshot.identity, snapshot.versions)

			switch (reason) {
				case 'text':
					empty.text = true
					break
				case 'gutter':
					empty.gutter = true
					break
				case 'overlay':
					empty.overlay = true
					break
				case 'viewport':
					empty.viewport = true
					break
				case 'decorations':
					empty.text = true
					empty.gutter = true
					break
				case 'fullMeasure':
					empty.fullMeasure = true
					break
			}

			onCoreChange(empty)
		},

		flushNow(): FlushReceipt | null {
			// Cancel any pending RAF and flush synchronously
			if (rafId !== null) {
				caf(rafId)
				rafId = null
			}
			return flush()
		},

		onDidFlush(listener: (receipt: FlushReceipt) => void): () => void {
			flushListeners.push(listener)
			return () => {
				const idx = flushListeners.indexOf(listener)
				if (idx >= 0) flushListeners.splice(idx, 1)
			}
		},

		destroy() {
			if (destroyed) return
			destroyed = true
			unsubscribeCore()
			if (rafId !== null) {
				caf(rafId)
				rafId = null
			}
			pendingDirty = null
			flushListeners.length = 0
		},
	}
}
