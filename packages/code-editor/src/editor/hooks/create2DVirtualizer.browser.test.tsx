import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { renderHook } from 'vitest-browser-solid'
import { createSignal } from 'solid-js'
import { create2DVirtualizer } from './create2DVirtualizer'
import type { VirtualItem2D } from '../types'

// ============================================================================
// DOM Integration Tests for create2DVirtualizer
// ============================================================================

const getLineId = (lineIndex: number) => lineIndex + 1

describe('create2DVirtualizer (DOM integration)', () => {
	let container: HTMLDivElement

	beforeEach(() => {
		container = document.createElement('div')
		container.style.cssText = `
			height: 200px;
			width: 800px;
			overflow: auto;
			position: relative;
		`
		document.body.appendChild(container)
	})

	afterEach(() => {
		container.remove()
	})

	it('initializes with correct values', async () => {
		const [count] = createSignal(100)
		const [enabled] = createSignal(true)
		const [rowHeight] = createSignal(20)
		const [charWidth] = createSignal(8)
		const { result, unmount } = renderHook(() =>
			create2DVirtualizer({
				count,
				enabled,
				scrollElement: () => container,
				rowHeight,
				charWidth,
				overscan: 2,
				getLineLength: () => 0,
				getLineId,
			})
		)

		await expect.poll(() => result.current.viewportHeight()).toBe(200)
		await expect.poll(() => result.current.viewportWidth()).toBe(800)
		expect(result.current.scrollTop()).toBe(0)
		expect(result.current.scrollLeft()).toBe(0)
		expect(result.current.totalSize()).toBe(2000) // 100 * 20

		unmount()
	})

	it('computes virtual items with 2D column ranges', async () => {
		const lineLengths = new Map<number, number>()
		// Mix of short and long lines
		for (let i = 0; i < 100; i++) {
			lineLengths.set(i, i % 10 === 0 ? 1000 : 100) // Every 10th line is long
		}

		const [count] = createSignal(100)
		const [enabled] = createSignal(true)
		const [rowHeight] = createSignal(20)
		const [charWidth] = createSignal(8)
		const getLineLength = (lineIndex: number) => lineLengths.get(lineIndex) ?? 0

		const { result, unmount } = renderHook(() =>
			create2DVirtualizer({
				count,
				enabled,
				scrollElement: () => container,
				rowHeight,
				charWidth,
				overscan: 2,
				getLineLength,
				getLineId,
			})
		)

		await expect
			.poll(() => result.current.virtualItems().length)
			.toBeGreaterThan(0)

		const items = result.current.virtualItems()

		// Short lines should have full range
		const shortLineItem = items.find((item: VirtualItem2D) => item.index % 10 !== 0)
		if (shortLineItem) {
			expect(shortLineItem.columnStart).toBe(0)
			expect(shortLineItem.columnEnd).toBe(100)
		}

		// Long lines should be virtualized (sliced)
		const longLineItem = items.find((item: VirtualItem2D) => item.index % 10 === 0)
		if (longLineItem) {
			// At scrollLeft=0, should render columnStart=0 and columnEnd < 1000
			expect(longLineItem.columnStart).toBe(0)
			expect(longLineItem.columnEnd).toBeLessThan(1000)
		}

		for (const item of items) {
			expect(Number.isFinite(item.columnStart)).toBe(true)
			expect(Number.isFinite(item.columnEnd)).toBe(true)
			expect(item.columnEnd).toBeGreaterThanOrEqual(item.columnStart)
		}

		unmount()
	})

	it('queries line lengths only for visible rows', async () => {
		const [count] = createSignal(200)
		const [enabled] = createSignal(true)
		const [rowHeight] = createSignal(20)
		const [charWidth] = createSignal(8)

		const calledIndices = new Set<number>()
		const getLineLength = (lineIndex: number) => {
			calledIndices.add(lineIndex)
			return 120
		}

		const { result, unmount } = renderHook(() =>
			create2DVirtualizer({
				count,
				enabled,
				scrollElement: () => container,
				rowHeight,
				charWidth,
				overscan: 2,
				getLineLength,
				getLineId,
			})
		)

		await expect
			.poll(() => result.current.virtualItems().length)
			.toBeGreaterThan(0)

		const items = result.current.virtualItems()
		const startIndex = items[0]?.index ?? 0
		const endIndex = items[items.length - 1]?.index ?? 0

		expect(calledIndices.size).toBeGreaterThan(0)
		expect(calledIndices.size).toBeLessThan(200)
		for (const index of calledIndices) {
			expect(index).toBeGreaterThanOrEqual(startIndex)
			expect(index).toBeLessThanOrEqual(endIndex)
		}

		unmount()
	})

	it('tracks scroll position correctly', async () => {
		const lineLengths = new Map<number, number>()
		for (let i = 0; i < 100; i++) {
			lineLengths.set(i, 2000) // All long lines
		}

		// Create scrollable content
		const content = document.createElement('div')
		content.style.height = '2000px'
		content.style.width = '16000px' // 2000 chars * 8px
		container.appendChild(content)

		const [count] = createSignal(100)
		const [enabled] = createSignal(true)
		const [rowHeight] = createSignal(20)
		const [charWidth] = createSignal(8)
		const getLineLength = (lineIndex: number) => lineLengths.get(lineIndex) ?? 0

		const { result, unmount } = renderHook(() =>
			create2DVirtualizer({
				count,
				enabled,
				scrollElement: () => container,
				rowHeight,
				charWidth,
				overscan: 2,
				getLineLength,
				getLineId,
			})
		)

		// Initial scroll
		expect(result.current.scrollTop()).toBe(0)
		expect(result.current.scrollLeft()).toBe(0)

		// Scroll both directions
		container.scrollTo({ top: 100, left: 200 })

		// Wait for RAF + scroll event
		await expect.poll(() => result.current.scrollTop()).toBe(100)
		await expect.poll(() => result.current.scrollLeft()).toBe(200)

		unmount()
	})

	it('does not recompute items for sub-row vertical scroll', async () => {
		// Create scrollable content
		const content = document.createElement('div')
		content.style.height = '2000px'
		content.style.width = '800px'
		container.appendChild(content)

		const [count] = createSignal(100)
		const [enabled] = createSignal(true)
		const [rowHeight] = createSignal(20)
		const [charWidth] = createSignal(8)
		const { result, unmount } = renderHook(() =>
			create2DVirtualizer({
				count,
				enabled,
				scrollElement: () => container,
				rowHeight,
				charWidth,
				overscan: 2,
				getLineLength: () => 120,
				getLineId,
			})
		)

		await expect
			.poll(() => result.current.virtualItems().length)
			.toBeGreaterThan(0)

		const beforeItems = result.current.virtualItems()

		// Sub-row scroll (5px < 20px rowHeight)
		// Scroll position is quantized to row boundaries for performance,
		// so the scrollTop signal won't update for sub-row scrolls
		container.scrollTo({ top: 5 })

		// Wait for DOM scroll to complete
		await expect.poll(() => container.scrollTop).toBe(5)

		// Virtual items should be the same reference (not recomputed)
		const afterItems = result.current.virtualItems()
		expect(afterItems).toBe(beforeItems)

		unmount()
	})

	it('does not recompute items for sub-column horizontal scroll', async () => {
		const lineLengths = new Map<number, number>()
		for (let i = 0; i < 100; i++) {
			lineLengths.set(i, 2000) // All long lines
		}

		// Create scrollable content
		const content = document.createElement('div')
		content.style.height = '2000px'
		content.style.width = '16000px'
		container.appendChild(content)

		const [count] = createSignal(100)
		const [enabled] = createSignal(true)
		const [rowHeight] = createSignal(20)
		const [charWidth] = createSignal(8)
		const getLineLength = (lineIndex: number) => lineLengths.get(lineIndex) ?? 0

		const { result, unmount } = renderHook(() =>
			create2DVirtualizer({
				count,
				enabled,
				scrollElement: () => container,
				rowHeight,
				charWidth,
				overscan: 2,
				horizontalOverscan: 10,
				getLineLength,
				getLineId,
			})
		)

		await expect
			.poll(() => result.current.virtualItems().length)
			.toBeGreaterThan(0)

		const beforeItems = result.current.virtualItems()

		// Sub-column scroll (4px < 8px charWidth)
		// Scroll position is quantized to column boundaries for performance,
		// so the scrollLeft signal won't update for sub-column scrolls
		container.scrollTo({ left: 4 })

		// Wait for DOM scroll to complete
		await expect.poll(() => container.scrollLeft).toBe(4)

		// Virtual items should be the same reference (not recomputed)
		const afterItems = result.current.virtualItems()
		expect(afterItems).toBe(beforeItems)

		unmount()
	})

	it('updates column ranges on horizontal scroll', async () => {
		const lineLengths = new Map<number, number>()
		// All long lines
		for (let i = 0; i < 100; i++) {
			lineLengths.set(i, 2000)
		}

		// Create scrollable content
		const content = document.createElement('div')
		content.style.height = '2000px'
		content.style.width = '16000px'
		container.appendChild(content)

		const [count] = createSignal(100)
		const [enabled] = createSignal(true)
		const [rowHeight] = createSignal(20)
		const [charWidth] = createSignal(8)
		const getLineLength = (lineIndex: number) => lineLengths.get(lineIndex) ?? 0

		const { result, unmount } = renderHook(() =>
			create2DVirtualizer({
				count,
				enabled,
				scrollElement: () => container,
				rowHeight,
				charWidth,
				overscan: 2,
				horizontalOverscan: 10,
				getLineLength,
				getLineId,
			})
		)

		// Wait for initial render
		await expect
			.poll(() => result.current.virtualItems().length)
			.toBeGreaterThan(0)

		const beforeItems = result.current.virtualItems()
		const firstItem = beforeItems[0]
		expect(firstItem?.columnStart).toBe(0)

		// Scroll horizontally
		container.scrollTo({ left: 1600 }) // 200 chars at 8px

		// Wait for the column ranges to update
		await expect
			.poll(() => {
				const items = result.current.virtualItems()
				return items[0]?.columnStart
			})
			.toBeGreaterThan(0)

		const afterItems = result.current.virtualItems()
		const updatedFirst = afterItems[0]

		// columnStart should have moved forward
		// scrollLeft=1600 / charWidth=8 = col 200, minus overscan 10 = 190
		expect(updatedFirst?.columnStart).toBeGreaterThanOrEqual(180)

		unmount()
	})

	it('returns empty items when disabled', async () => {
		const [count] = createSignal(100)
		const [enabled, setEnabled] = createSignal(true)
		const [rowHeight] = createSignal(20)
		const [charWidth] = createSignal(8)
		const { result, unmount } = renderHook(() =>
			create2DVirtualizer({
				count,
				enabled,
				scrollElement: () => container,
				rowHeight,
				charWidth,
				overscan: 2,
				getLineLength: () => 0,
				getLineId,
			})
		)

		await expect
			.poll(() => result.current.virtualItems().length)
			.toBeGreaterThan(0)

		setEnabled(false)

		await expect.poll(() => result.current.virtualItems()).toEqual([])

		unmount()
	})
})
