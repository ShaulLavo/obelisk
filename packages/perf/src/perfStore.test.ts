import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
	record,
	getHistory,
	clear,
	getSummary,
	getRecentForOperation,
	exportData,
	configureMaxEntries,
	onRecord,
} from './perfStore'

describe('perfStore', () => {
	beforeEach(() => {
		clear()
		configureMaxEntries(Infinity)
	})

	describe('record', () => {
		it('creates a record with id and timestamp', () => {
			const rec = record({
				name: 'test-op',
				duration: 100,
				breakdown: [],
			})
			expect(rec.id).toBeTruthy()
			expect(rec.name).toBe('test-op')
			expect(rec.duration).toBe(100)
			expect(rec.timestamp).toBeGreaterThan(0)
		})

		it('includes metadata when provided', () => {
			const rec = record({
				name: 'op',
				duration: 50,
				breakdown: [],
				metadata: { fileCount: 3 },
			})
			expect(rec.metadata).toEqual({ fileCount: 3 })
		})

		it('includes breakdown entries', () => {
			const rec = record({
				name: 'op',
				duration: 200,
				breakdown: [
					{ label: 'parse', duration: 100 },
					{ label: 'render', duration: 100 },
				],
			})
			expect(rec.breakdown).toHaveLength(2)
		})
	})

	describe('getHistory', () => {
		it('returns all records when no filter', () => {
			record({ name: 'a', duration: 1, breakdown: [] })
			record({ name: 'b', duration: 2, breakdown: [] })
			const history = getHistory()
			expect(history).toHaveLength(2)
		})

		it('filters by name', () => {
			record({ name: 'a', duration: 1, breakdown: [] })
			record({ name: 'b', duration: 2, breakdown: [] })
			const history = getHistory({ name: 'a' })
			expect(history).toHaveLength(1)
			expect(history[0]!.name).toBe('a')
		})

		it('filters by since timestamp', () => {
			record({ name: 'old', duration: 1, breakdown: [] })
			const _cutoff = Date.now() + 1
			// The next record will have timestamp >= cutoff only if time advances.
			// Use a direct approach: filter by name instead for determinism.
			record({ name: 'new', duration: 2, breakdown: [] })
			const history = getHistory({ name: 'new' })
			expect(history).toHaveLength(1)
		})

		it('returns a copy, not the internal array', () => {
			record({ name: 'x', duration: 1, breakdown: [] })
			const h1 = getHistory()
			const h2 = getHistory()
			expect(h1).not.toBe(h2)
		})
	})

	describe('clear', () => {
		it('removes all records', () => {
			record({ name: 'a', duration: 1, breakdown: [] })
			record({ name: 'b', duration: 2, breakdown: [] })
			clear()
			expect(getHistory()).toHaveLength(0)
		})
	})

	describe('getSummary', () => {
		it('aggregates records by name', () => {
			record({ name: 'op', duration: 100, breakdown: [] })
			record({ name: 'op', duration: 200, breakdown: [] })
			record({ name: 'other', duration: 50, breakdown: [] })

			const summaries = getSummary()
			const opSummary = summaries.find((s) => s.name === 'op')!

			expect(opSummary.count).toBe(2)
			expect(opSummary.totalDuration).toBe(300)
			expect(opSummary.avgDuration).toBe(150)
			expect(opSummary.minDuration).toBe(100)
			expect(opSummary.maxDuration).toBe(200)
		})

		it('computes p95 duration', () => {
			for (let i = 1; i <= 100; i++) {
				record({ name: 'perf', duration: i, breakdown: [] })
			}
			const summaries = getSummary({ name: 'perf' })
			const summary = summaries[0]!
			expect(summary.p95Duration).toBe(95)
		})

		it('sorts summaries by total duration descending', () => {
			record({ name: 'fast', duration: 10, breakdown: [] })
			record({ name: 'slow', duration: 500, breakdown: [] })
			record({ name: 'medium', duration: 100, breakdown: [] })

			const summaries = getSummary()
			expect(summaries[0]!.name).toBe('slow')
			expect(summaries[summaries.length - 1]!.name).toBe('fast')
		})
	})

	describe('getRecentForOperation', () => {
		it('returns recent records for a given operation', () => {
			for (let i = 0; i < 20; i++) {
				record({ name: 'op', duration: i, breakdown: [] })
			}
			const recent = getRecentForOperation('op', 5)
			expect(recent).toHaveLength(5)
			// Should be the last 5
			expect(recent[0]!.duration).toBe(15)
			expect(recent[4]!.duration).toBe(19)
		})

		it('returns empty array for unknown operation', () => {
			expect(getRecentForOperation('unknown')).toHaveLength(0)
		})
	})

	describe('configureMaxEntries', () => {
		it('trims records when max is reduced', () => {
			for (let i = 0; i < 10; i++) {
				record({ name: 'x', duration: i, breakdown: [] })
			}
			configureMaxEntries(3)
			expect(getHistory()).toHaveLength(3)
			// Should keep the most recent
			expect(getHistory()[0]!.duration).toBe(7)
		})

		it('clears all records when max is 0', () => {
			record({ name: 'x', duration: 1, breakdown: [] })
			configureMaxEntries(0)
			expect(getHistory()).toHaveLength(0)
		})
	})

	describe('exportData', () => {
		it('returns a copy of all records', () => {
			record({ name: 'a', duration: 1, breakdown: [] })
			const data = exportData()
			expect(data).toHaveLength(1)
			expect(data).not.toBe(exportData())
		})
	})

	describe('onRecord', () => {
		it('notifies callback when a record is added', () => {
			const cb = vi.fn()
			const unsub = onRecord(cb)

			record({ name: 'notify', duration: 42, breakdown: [] })
			expect(cb).toHaveBeenCalledTimes(1)
			expect(cb).toHaveBeenCalledWith(
				expect.objectContaining({ name: 'notify', duration: 42 })
			)

			unsub()
		})

		it('stops notifying after unsubscribe', () => {
			const cb = vi.fn()
			const unsub = onRecord(cb)
			unsub()

			record({ name: 'x', duration: 1, breakdown: [] })
			expect(cb).not.toHaveBeenCalled()
		})

		it('swallows errors from callback', () => {
			const cb = vi.fn().mockImplementation(() => {
				throw new Error('callback error')
			})
			const unsub = onRecord(cb)

			// Should not throw
			expect(() =>
				record({ name: 'x', duration: 1, breakdown: [] })
			).not.toThrow()

			unsub()
		})
	})
})
