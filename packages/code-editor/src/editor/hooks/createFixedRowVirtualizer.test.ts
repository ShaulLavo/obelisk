import { describe, expect, it } from 'vitest'
import {
	computeFixedRowTotalSize,
	computeFixedRowVisibleRange,
	computeFixedRowVirtualItems,
	type FixedRowVisibleRange,
} from './createFixedRowVirtualizer'

// ============================================================================
// Unit Tests - Pure Functions (no DOM required, runs in Node)
// ============================================================================

describe('computeFixedRowTotalSize', () => {
	it('returns 0 for empty list', () => {
		expect(computeFixedRowTotalSize(0, 20)).toBe(0)
	})

	it('computes total size correctly', () => {
		expect(computeFixedRowTotalSize(10, 20)).toBe(200)
		expect(computeFixedRowTotalSize(100, 16)).toBe(1600)
		expect(computeFixedRowTotalSize(1000, 24)).toBe(24000)
	})

	it('handles edge cases gracefully', () => {
		expect(computeFixedRowTotalSize(-1, 20)).toBe(0) // negative count
		expect(computeFixedRowTotalSize(10, 0)).toBe(10) // zero height → normalizes to 1
		expect(computeFixedRowTotalSize(10, -5)).toBe(10) // negative height → normalizes to 1
		expect(computeFixedRowTotalSize(NaN, 20)).toBe(0) // NaN count
		expect(computeFixedRowTotalSize(10, NaN)).toBe(10) // NaN height → normalizes to 1
	})
})

describe('computeFixedRowVisibleRange', () => {
	it('returns empty range when disabled', () => {
		const range = computeFixedRowVisibleRange({
			enabled: false,
			count: 100,
			rowHeight: 20,
			scrollTop: 0,
			viewportHeight: 500,
		})
		expect(range).toEqual({ start: 0, end: 0 })
	})

	it('returns empty range for empty list', () => {
		const range = computeFixedRowVisibleRange({
			enabled: true,
			count: 0,
			rowHeight: 20,
			scrollTop: 0,
			viewportHeight: 500,
		})
		expect(range).toEqual({ start: 0, end: 0 })
	})

	it('computes visible range at top', () => {
		const range = computeFixedRowVisibleRange({
			enabled: true,
			count: 100,
			rowHeight: 20,
			scrollTop: 0,
			viewportHeight: 100,
		})
		// 100px viewport / 20px row = 5 visible rows (indices 0-4)
		// But ceil((100 + 20 - 1) / 20) = 6 visible count, so end = start + 6 - 1 = 5
		expect(range).toEqual({ start: 0, end: 5 })
	})

	it('computes visible range at middle', () => {
		const range = computeFixedRowVisibleRange({
			enabled: true,
			count: 100,
			rowHeight: 20,
			scrollTop: 200,
			viewportHeight: 100,
		})
		// scrollTop 200 / 20 = row 10
		expect(range.start).toBe(10)
		expect(range.end).toBe(15)
	})

	it('clamps to end of list', () => {
		const range = computeFixedRowVisibleRange({
			enabled: true,
			count: 50,
			rowHeight: 20,
			scrollTop: 900, // row 45
			viewportHeight: 200, // 10 rows visible
		})
		expect(range.start).toBe(45)
		expect(range.end).toBe(49) // clamped to count - 1
	})

	it('handles zero viewport height (renders at least 1 row)', () => {
		const range = computeFixedRowVisibleRange({
			enabled: true,
			count: 100,
			rowHeight: 20,
			scrollTop: 0,
			viewportHeight: 0,
		})
		expect(range).toEqual({ start: 0, end: 0 })
	})
})

describe('computeFixedRowVirtualItems', () => {
	it('returns empty array when disabled', () => {
		const items = computeFixedRowVirtualItems({
			enabled: false,
			count: 100,
			rowHeight: 20,
			range: { start: 0, end: 10 },
			overscan: 5,
		})
		expect(items).toEqual([])
	})

	it('returns empty array for empty list', () => {
		const items = computeFixedRowVirtualItems({
			enabled: true,
			count: 0,
			rowHeight: 20,
			range: { start: 0, end: 0 },
			overscan: 5,
		})
		expect(items).toEqual([])
	})

	it('computes items with overscan at start', () => {
		const range: FixedRowVisibleRange = { start: 0, end: 5 }
		const items = computeFixedRowVirtualItems({
			enabled: true,
			count: 100,
			rowHeight: 20,
			range,
			overscan: 3,
		})
		// start: max(0, 0-3) = 0
		// end: min(99, 5+3) = 8
		expect(items.length).toBe(9)
		expect(items[0]?.index).toBe(0)
		expect(items[8]?.index).toBe(8)
	})

	it('computes items with overscan at middle', () => {
		const range: FixedRowVisibleRange = { start: 20, end: 25 }
		const items = computeFixedRowVirtualItems({
			enabled: true,
			count: 100,
			rowHeight: 20,
			range,
			overscan: 5,
		})
		// start: max(0, 20-5) = 15
		// end: min(99, 25+5) = 30
		expect(items.length).toBe(16)
		expect(items[0]?.index).toBe(15)
		expect(items[15]?.index).toBe(30)
	})

	it('clamps overscan to list bounds', () => {
		const range: FixedRowVisibleRange = { start: 95, end: 99 }
		const items = computeFixedRowVirtualItems({
			enabled: true,
			count: 100,
			rowHeight: 20,
			range,
			overscan: 10,
		})
		// start: max(0, 95-10) = 85
		// end: min(99, 99+10) = 99
		expect(items.length).toBe(15)
		expect(items[0]?.index).toBe(85)
		expect(items[14]?.index).toBe(99)
	})

	it('computes correct start positions', () => {
		const range: FixedRowVisibleRange = { start: 5, end: 10 }
		const items = computeFixedRowVirtualItems({
			enabled: true,
			count: 100,
			rowHeight: 25,
			range,
			overscan: 0,
		})
		expect(items[0]).toEqual({ index: 5, start: 125, size: 25 })
		expect(items[1]).toEqual({ index: 6, start: 150, size: 25 })
		expect(items[5]).toEqual({ index: 10, start: 250, size: 25 })
	})
})
