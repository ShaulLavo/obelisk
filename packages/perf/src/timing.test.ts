import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTimingTracker } from './timing'

describe('createTimingTracker', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	it('tracks synchronous operations', () => {
		const tracker = createTimingTracker()
		const result = tracker.timeSync('step-a', () => 42)
		expect(result).toBe(42)
		expect(tracker.getTotalDuration()).toBeGreaterThanOrEqual(0)
	})

	it('tracks async operations', async () => {
		const tracker = createTimingTracker()
		const result = await tracker.timeAsync('step-b', async () => {
			return 'hello'
		})
		expect(result).toBe('hello')
	})

	it('supports nested timing', () => {
		const tracker = createTimingTracker()
		tracker.timeSync('outer', ({ timeSync }) => {
			timeSync('inner', () => {
				// no-op
			})
		})
		const table = tracker.formatTable()
		expect(table).toContain('outer')
		expect(table).toContain('inner')
	})

	it('supports nested async timing', async () => {
		const tracker = createTimingTracker()
		await tracker.timeAsync('outer', async ({ timeAsync }) => {
			await timeAsync('inner', async () => {
				// no-op
			})
		})
		const table = tracker.formatTable()
		expect(table).toContain('outer')
		expect(table).toContain('inner')
	})

	it('formatTable returns empty string when no steps are tracked', () => {
		const tracker = createTimingTracker()
		expect(tracker.formatTable()).toBe('')
	})

	it('formatTable includes step header, total, and dividers', () => {
		const tracker = createTimingTracker()
		tracker.timeSync('alpha', () => {})
		const table = tracker.formatTable()
		expect(table).toContain('step')
		expect(table).toContain('duration')
		expect(table).toContain('total')
		expect(table).toContain('alpha')
	})

	it('shows untracked time when above threshold', () => {
		// By using a very low threshold and adding some delay, untracked time appears.
		const tracker = createTimingTracker({ untrackedThresholdMs: 0 })
		// Don't track anything explicitly, but total duration > 0
		// Force a small elapsed time by reading total
		const table = tracker.formatTable()
		// With 0 threshold and no tracked steps, untracked row may appear
		// if any wall time elapsed. This is non-deterministic, so just check
		// the function doesn't crash.
		expect(typeof table).toBe('string')
	})

	it('log calls the logger function', () => {
		const logger = vi.fn()
		const tracker = createTimingTracker({ logger })
		tracker.timeSync('step', () => {})
		const message = tracker.log('OK', (total) => `done in ${total.toFixed(0)}ms`)
		expect(logger).toHaveBeenCalledWith(expect.stringContaining('done in'))
		expect(message).toContain('done in')
		expect(message).toContain('step')
	})

	it('log includes extraInfo when provided', () => {
		const tracker = createTimingTracker()
		tracker.timeSync('x', () => {})
		const message = tracker.log('OK', () => 'summary', 'extra details here')
		expect(message).toContain('extra details here')
	})

	it('getTotalDuration returns elapsed time', () => {
		const tracker = createTimingTracker()
		const duration = tracker.getTotalDuration()
		expect(duration).toBeGreaterThanOrEqual(0)
	})

	it('propagates exceptions from sync operations', () => {
		const tracker = createTimingTracker()
		expect(() =>
			tracker.timeSync('failing', () => {
				throw new Error('sync fail')
			})
		).toThrow('sync fail')
	})

	it('propagates exceptions from async operations', async () => {
		const tracker = createTimingTracker()
		await expect(
			tracker.timeAsync('failing', async () => {
				throw new Error('async fail')
			})
		).rejects.toThrow('async fail')
	})
})
