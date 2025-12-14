import { describe, expect, it } from 'bun:test'
import {
	computeFixedRowTotalSize,
	computeFixedRowVisibleRange,
	computeFixedRowVirtualItems,
} from './createFixedRowVirtualizer'

describe('createFixedRowVirtualizer math', () => {
	it('computes total size for fixed rows', () => {
		expect(computeFixedRowTotalSize(0, 20)).toBe(0)
		expect(computeFixedRowTotalSize(10, 20)).toBe(200)
	})

	it('renders only overscan rows when viewport height is zero', () => {
		const range = computeFixedRowVisibleRange({
			enabled: true,
			count: 100,
			rowHeight: 20,
			scrollTop: 0,
			viewportHeight: 0,
		})

		expect(range).toEqual({ start: 0, end: 0 })

		const items = computeFixedRowVirtualItems({
			enabled: true,
			count: 100,
			rowHeight: 20,
			range,
			overscan: 10,
		})

		expect(items.length).toBe(11)
		expect(items[0]?.index).toBe(0)
		expect(items[10]?.index).toBe(10)
	})

	it('computes visible window and overscanned items', () => {
		const range = computeFixedRowVisibleRange({
			enabled: true,
			count: 100,
			rowHeight: 20,
			scrollTop: 0,
			viewportHeight: 100,
		})

		expect(range).toEqual({ start: 0, end: 5 })

		const items = computeFixedRowVirtualItems({
			enabled: true,
			count: 100,
			rowHeight: 20,
			range,
			overscan: 10,
		})

		expect(items.length).toBe(16)
		expect(items[0]?.index).toBe(0)
		expect(items[15]?.index).toBe(15)
	})

	it('updates the visible range based on scrollTop', () => {
		const range = computeFixedRowVisibleRange({
			enabled: true,
			count: 100,
			rowHeight: 20,
			scrollTop: 200,
			viewportHeight: 100,
		})

		expect(range).toEqual({ start: 10, end: 15 })

		const items = computeFixedRowVirtualItems({
			enabled: true,
			count: 100,
			rowHeight: 20,
			range,
			overscan: 10,
		})

		expect(items.length).toBe(26)
		expect(items[0]?.index).toBe(0)
		expect(items[25]?.index).toBe(25)
	})
})
