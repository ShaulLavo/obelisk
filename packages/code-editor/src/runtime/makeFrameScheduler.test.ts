import { describe, it, expect, vi } from 'vitest'
import { makeEditorCore } from '../core/makeEditorCore'
import { makeFrameScheduler, type FrameSchedulerConfig } from './makeFrameScheduler'
import type { EditorCore, EditorDirtyState, FlushReceipt, FlushTarget } from '../core/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createCore = (content = 'hello\nworld\nfoo') =>
	makeEditorCore({ document: { key: 'test.ts', content } })

/** A flush target that records calls and returns a receipt. */
const createMockFlushTarget = () => {
	const calls: EditorDirtyState[] = []
	const target: FlushTarget = (dirty) => {
		calls.push(dirty)
		return {
			identity: dirty.identity,
			docVersion: dirty.docVersion,
			rowsUpdated: dirty.lineRange
				? dirty.lineRange.end - dirty.lineRange.start + 1
				: 0,
			overlayUpdated: dirty.overlay,
			gutterUpdated: dirty.gutter,
			durationMicros: 0, // overwritten by scheduler
		}
	}
	return { target, calls }
}

/** Creates a scheduler with a synchronous fake RAF for testing. */
const createTestScheduler = (core: EditorCore, flushTarget: FlushTarget) => {
	const rafCallbacks: Array<FrameRequestCallback> = []
	let nextId = 1
	const cancelledIds = new Set<number>()

	const fakeRaf = (cb: FrameRequestCallback) => {
		const id = nextId++
		rafCallbacks.push(cb)
		return id
	}
	const fakeCaf = (id: number) => {
		cancelledIds.add(id)
	}

	const scheduler = makeFrameScheduler({
		core,
		flushTarget,
		requestAnimationFrame: fakeRaf,
		cancelAnimationFrame: fakeCaf,
	})

	/** Simulate a RAF tick. */
	const tick = () => {
		const cbs = rafCallbacks.splice(0)
		for (const cb of cbs) {
			cb(performance.now())
		}
	}

	return { scheduler, tick, rafCallbacks, cancelledIds }
}

describe('makeFrameScheduler', () => {
	// -----------------------------------------------------------------
	// Dirty coalescing
	// -----------------------------------------------------------------

	describe('dirty coalescing', () => {
		it('coalesces multiple mutations into one flush', () => {
			const core = createCore()
			const { target, calls } = createMockFlushTarget()
			const { scheduler, tick } = createTestScheduler(core, target)

			// Three rapid dispatches before a frame tick
			core.dispatch({ type: 'insert-text', text: 'a' })
			core.dispatch({ type: 'insert-text', text: 'b' })
			core.dispatch({ type: 'insert-text', text: 'c' })

			// No flush yet
			expect(calls.length).toBe(0)

			// One tick -> one flush with all three mutations merged
			tick()
			expect(calls.length).toBe(1)
			expect(calls[0]!.text).toBe(true)

			scheduler.destroy()
		})

		it('merges line ranges across mutations', () => {
			const core = createCore('aaa\nbbb\nccc\nddd\neee')
			const { target, calls } = createMockFlushTarget()
			const { scheduler, tick } = createTestScheduler(core, target)

			// Edit line 0
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })
			core.dispatch({ type: 'insert-text', text: 'X' })
			// Edit line 4
			core.dispatch({ type: 'set-selection', anchor: 19, focus: 19 })
			core.dispatch({ type: 'insert-text', text: 'Y' })

			tick()
			expect(calls.length).toBe(1)
			const dirty = calls[0]!
			expect(dirty.lineRange).not.toBeNull()
			// Range should span from line 0 to at least line 4
			expect(dirty.lineRange!.start).toBe(0)
			expect(dirty.lineRange!.end).toBeGreaterThanOrEqual(4)

			scheduler.destroy()
		})

		it('does not flush when there is no dirty state', () => {
			const core = createCore()
			const { target, calls } = createMockFlushTarget()
			const { scheduler, tick } = createTestScheduler(core, target)

			tick()
			expect(calls.length).toBe(0)

			scheduler.destroy()
		})

		it('accumulates across multiple reasons', () => {
			const core = createCore()
			const { target, calls } = createMockFlushTarget()
			const { scheduler, tick } = createTestScheduler(core, target)

			core.dispatch({ type: 'insert-text', text: 'x' })
			scheduler.requestFlush('viewport')

			tick()
			expect(calls.length).toBe(1)
			expect(calls[0]!.text).toBe(true)
			expect(calls[0]!.viewport).toBe(true)

			scheduler.destroy()
		})
	})

	// -----------------------------------------------------------------
	// Viewport-only updates
	// -----------------------------------------------------------------

	describe('viewport-only updates', () => {
		it('viewport flush does not set text dirty', () => {
			const core = createCore()
			const { target, calls } = createMockFlushTarget()
			const { scheduler, tick } = createTestScheduler(core, target)

			// Update viewport through core — this is a non-transactional path
			core.updateViewport({ scrollTop: 100, scrollLeft: 0, viewportWidth: 800, viewportHeight: 600 })

			tick()
			expect(calls.length).toBe(1)
			expect(calls[0]!.viewport).toBe(true)
			expect(calls[0]!.text).toBe(false)
			expect(calls[0]!.gutter).toBe(false)

			scheduler.destroy()
		})

		it('requestFlush with viewport reason sets only viewport dirty', () => {
			const core = createCore()
			const { target, calls } = createMockFlushTarget()
			const { scheduler, tick } = createTestScheduler(core, target)

			scheduler.requestFlush('viewport')

			tick()
			expect(calls.length).toBe(1)
			expect(calls[0]!.viewport).toBe(true)
			expect(calls[0]!.text).toBe(false)

			scheduler.destroy()
		})
	})

	// -----------------------------------------------------------------
	// FlushReceipt
	// -----------------------------------------------------------------

	describe('flush receipt', () => {
		it('flushNow returns a receipt', () => {
			const core = createCore()
			const { target } = createMockFlushTarget()
			const { scheduler } = createTestScheduler(core, target)

			core.dispatch({ type: 'insert-text', text: 'z' })

			const receipt = scheduler.flushNow()
			expect(receipt).not.toBeNull()
			expect(receipt!.docVersion).toBeGreaterThan(0)
			expect(receipt!.durationMicros).toBeGreaterThanOrEqual(0)

			scheduler.destroy()
		})

		it('flushNow returns null when no dirty state', () => {
			const core = createCore()
			const { target } = createMockFlushTarget()
			const { scheduler } = createTestScheduler(core, target)

			const receipt = scheduler.flushNow()
			expect(receipt).toBeNull()

			scheduler.destroy()
		})

		it('emits receipt to onDidFlush listeners', () => {
			const core = createCore()
			const { target } = createMockFlushTarget()
			const { scheduler } = createTestScheduler(core, target)

			const receipts: FlushReceipt[] = []
			scheduler.onDidFlush((r) => receipts.push(r))

			core.dispatch({ type: 'insert-text', text: 'a' })
			scheduler.flushNow()

			expect(receipts.length).toBe(1)
			expect(receipts[0]!.durationMicros).toBeGreaterThanOrEqual(0)

			scheduler.destroy()
		})

		it('unsubscribes onDidFlush listener', () => {
			const core = createCore()
			const { target } = createMockFlushTarget()
			const { scheduler } = createTestScheduler(core, target)

			const receipts: FlushReceipt[] = []
			const unsub = scheduler.onDidFlush((r) => receipts.push(r))

			core.dispatch({ type: 'insert-text', text: 'a' })
			scheduler.flushNow()
			expect(receipts.length).toBe(1)

			unsub()

			core.dispatch({ type: 'insert-text', text: 'b' })
			scheduler.flushNow()
			expect(receipts.length).toBe(1) // no new receipt

			scheduler.destroy()
		})
	})

	// -----------------------------------------------------------------
	// requestFlush reasons
	// -----------------------------------------------------------------

	describe('requestFlush reasons', () => {
		it('text reason sets text dirty', () => {
			const core = createCore()
			const { target, calls } = createMockFlushTarget()
			const { scheduler } = createTestScheduler(core, target)

			scheduler.requestFlush('text')
			const receipt = scheduler.flushNow()
			expect(receipt).not.toBeNull()
			expect(calls[0]!.text).toBe(true)

			scheduler.destroy()
		})

		it('fullMeasure reason sets fullMeasure dirty', () => {
			const core = createCore()
			const { target, calls } = createMockFlushTarget()
			const { scheduler } = createTestScheduler(core, target)

			scheduler.requestFlush('fullMeasure')
			scheduler.flushNow()
			expect(calls[0]!.fullMeasure).toBe(true)

			scheduler.destroy()
		})

		it('overlay reason sets overlay dirty', () => {
			const core = createCore()
			const { target, calls } = createMockFlushTarget()
			const { scheduler } = createTestScheduler(core, target)

			scheduler.requestFlush('overlay')
			scheduler.flushNow()
			expect(calls[0]!.overlay).toBe(true)

			scheduler.destroy()
		})
	})

	// -----------------------------------------------------------------
	// Destroy
	// -----------------------------------------------------------------

	describe('destroy', () => {
		it('stops processing after destroy', () => {
			const core = createCore()
			const { target, calls } = createMockFlushTarget()
			const { scheduler, tick } = createTestScheduler(core, target)

			scheduler.destroy()

			core.dispatch({ type: 'insert-text', text: 'a' })
			tick()
			expect(calls.length).toBe(0)
		})

		it('flushNow returns null after destroy', () => {
			const core = createCore()
			const { target } = createMockFlushTarget()
			const { scheduler } = createTestScheduler(core, target)

			core.dispatch({ type: 'insert-text', text: 'a' })
			scheduler.destroy()

			expect(scheduler.flushNow()).toBeNull()
		})

		it('is idempotent', () => {
			const core = createCore()
			const { target } = createMockFlushTarget()
			const { scheduler } = createTestScheduler(core, target)

			scheduler.destroy()
			scheduler.destroy() // should not throw
		})
	})

	// -----------------------------------------------------------------
	// Fake view target (adapter pattern)
	// -----------------------------------------------------------------

	describe('fake view target', () => {
		it('works with a no-op flush target', () => {
			const core = createCore()
			const noopTarget: FlushTarget = (dirty) => ({
				identity: dirty.identity,
				docVersion: dirty.docVersion,
				rowsUpdated: 0,
				overlayUpdated: false,
				gutterUpdated: false,
				durationMicros: 0,
			})
			const { scheduler } = createTestScheduler(core, noopTarget)

			core.dispatch({ type: 'insert-text', text: 'test' })
			const receipt = scheduler.flushNow()
			expect(receipt).not.toBeNull()
			expect(receipt!.rowsUpdated).toBe(0)

			scheduler.destroy()
		})
	})
})
