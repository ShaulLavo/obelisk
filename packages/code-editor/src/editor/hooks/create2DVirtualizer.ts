import {
	batch,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	untrack,
	type Accessor,
} from 'solid-js'
import { createStore, type SetStoreFunction } from 'solid-js/store'

import { trackMicro } from '@repo/perf'
import type { VirtualItem2D } from '../types'
import {
	COLUMN_CHARS_PER_ITEM,
	HORIZONTAL_VIRTUALIZER_OVERSCAN,
} from '../consts'

export type Virtualizer2DOptions = {
	count: Accessor<number>
	enabled: Accessor<boolean>
	scrollElement: Accessor<HTMLElement | null>
	rowHeight: Accessor<number>
	charWidth: Accessor<number>
	overscan: number
	horizontalOverscan?: number
	// On-demand line length lookup (in characters)
	getLineLength: (lineIndex: number) => number
	// Stable line identity lookup
	getLineId: (lineIndex: number) => number
}

export type Virtualizer2D = {
	scrollTop: Accessor<number>
	scrollLeft: Accessor<number>
	viewportHeight: Accessor<number>
	viewportWidth: Accessor<number>
	virtualItems: Accessor<VirtualItem2D[]>
	visibleRange: Accessor<{ start: number; end: number }>
	totalSize: Accessor<number>
	isScrolling: Accessor<boolean>
	scrollDirection: Accessor<'forward' | 'backward' | null>
	scrollToIndex: (
		index: number,
		options?: { align?: 'auto' | 'start' | 'center' | 'end' }
	) => void
	scrollToOffset: (offset: number) => void
}

export type VisibleRange2D = {
	rowStart: number
	rowEnd: number
	colStart: number
	colEnd: number
}

type VirtualItemStore = {
	state: VirtualItem2D
	setState: SetStoreFunction<VirtualItem2D>
}

// Lines shorter than this will not be horizontally virtualized
// This ensures zero overhead for normal code files
export const VIRTUALIZATION_THRESHOLD = 500

const normalizeNumber = (value: number): number =>
	Number.isFinite(value) ? value : 0

const normalizeCount = (count: number): number =>
	Number.isFinite(count) && count > 0 ? Math.floor(count) : 0

const normalizeRowHeight = (value: number): number =>
	Number.isFinite(value) && value > 0 ? value : 1

const normalizeCharWidth = (value: number): number =>
	Number.isFinite(value) && value > 0 ? value : 8

export const computeTotalHeight2D = (
	count: number,
	rowHeight: number
): number => normalizeCount(count) * normalizeRowHeight(rowHeight)

export const computeVisibleRange2D = (options: {
	enabled: boolean
	count: number
	rowHeight: number
	charWidth: number
	scrollTop: number
	scrollLeft: number
	viewportHeight: number
	viewportWidth: number
	// We don't need per-line data here, just viewport dimensions
}): VisibleRange2D => {
	const count = normalizeCount(options.count)
	if (!options.enabled || count === 0)
		return { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

	const rowHeight = normalizeRowHeight(options.rowHeight)
	const charWidth = normalizeCharWidth(options.charWidth)
	const top = normalizeNumber(options.scrollTop)
	const left = normalizeNumber(options.scrollLeft)
	const height = normalizeNumber(options.viewportHeight)
	const width = normalizeNumber(options.viewportWidth)

	// Vertical range
	const rowStart = Math.max(0, Math.min(count - 1, Math.floor(top / rowHeight)))
	const visibleRows = Math.max(
		1,
		Math.ceil((height + rowHeight - 1) / rowHeight)
	)
	const rowEnd = Math.max(
		rowStart,
		Math.min(count - 1, rowStart + visibleRows - 1)
	)

	// Horizontal range (global approximation)
	// Individual lines will clamp this based on their actual length
	const colStart = Math.max(0, Math.floor(left / charWidth))
	const visibleCols = Math.max(1, Math.ceil(width / charWidth))
	const colEnd = colStart + visibleCols

	return { rowStart, rowEnd, colStart, colEnd }
}

/**
 * Pure function to compute the column range for a single line.
 * This is the core threshold logic: short lines render fully,
 * long lines are virtualized.
 */
export const computeColumnRange = (options: {
	lineLength: number
	scrollLeft: number
	viewportWidth: number
	charWidth: number
	horizontalOverscan: number
}): { columnStart: number; columnEnd: number } => {
	const {
		lineLength,
		scrollLeft,
		viewportWidth,
		charWidth,
		horizontalOverscan,
	} = options

	// Short lines: no horizontal virtualization
	if (lineLength <= VIRTUALIZATION_THRESHOLD) {
		return { columnStart: 0, columnEnd: lineLength }
	}

	// Long lines: slice to visible range
	const colStartBase = Math.max(0, Math.floor(scrollLeft / charWidth))
	const visibleCols = Math.max(1, Math.ceil(viewportWidth / charWidth))
	const hStart = Math.max(0, colStartBase - horizontalOverscan)
	const hEnd = Math.min(
		lineLength,
		colStartBase + visibleCols + horizontalOverscan
	)

	// If we scrolled past the end of this line
	if (hStart >= lineLength) {
		return { columnStart: 0, columnEnd: 0 }
	}

	return { columnStart: hStart, columnEnd: hEnd }
}

export function create2DVirtualizer(
	options: Virtualizer2DOptions
): Virtualizer2D {
	const [scrollTop, setScrollTop] = createSignal(0)
	const [scrollLeft, setScrollLeft] = createSignal(0)
	const [viewportHeight, setViewportHeight] = createSignal(0)
	const [viewportWidth, setViewportWidth] = createSignal(0)
	const [isScrolling, setIsScrolling] = createSignal(false)
	const [scrollDirection, setScrollDirection] = createSignal<
		'forward' | 'backward' | null
	>(null)
	const overscan = Math.max(0, options.overscan)
	const horizontalOverscan = Math.max(
		0,
		options.horizontalOverscan ??
			HORIZONTAL_VIRTUALIZER_OVERSCAN * COLUMN_CHARS_PER_ITEM
	)

	// Scroll handler setup
	createEffect(() => {
		const enabled = options.enabled()
		const element = options.scrollElement()

		if (!enabled) return
		if (!element) return

		// Initial Sync
		setScrollTop(normalizeNumber(element.scrollTop))
		setScrollLeft(normalizeNumber(element.scrollLeft))

		const updateViewportDims = () => {
			const height = normalizeNumber(element.clientHeight)
			const width = normalizeNumber(element.clientWidth)
			batch(() => {
				setViewportHeight(height)
				setViewportWidth(width)
			})
		}

	let rafScrollState = 0
	let scrollTimeoutId: ReturnType<typeof setTimeout>
	let pendingScrollTop = untrack(scrollTop)
	let pendingScrollLeft = untrack(scrollLeft)
	let lastAppliedTop = pendingScrollTop
	let lastAppliedLeft = pendingScrollLeft
	let lastQuantizedTop = pendingScrollTop
	let lastQuantizedLeft = pendingScrollLeft

	const onScroll = () => {
		pendingScrollTop = normalizeNumber(element.scrollTop)
		pendingScrollLeft = normalizeNumber(element.scrollLeft)

			if (!rafScrollState) {
				rafScrollState = requestAnimationFrame(() => {
					rafScrollState = 0

				const rowHeight = normalizeRowHeight(options.rowHeight())
				const charWidth = normalizeCharWidth(options.charWidth())
				const nextTop = pendingScrollTop
				const nextLeft = pendingScrollLeft
				const quantizedTop =
					rowHeight > 0
						? Math.floor(nextTop / rowHeight) * rowHeight
						: nextTop
				const quantizedLeft =
					charWidth > 0
						? Math.floor(nextLeft / charWidth) * charWidth
						: nextLeft
				const didChange =
					nextTop !== lastAppliedTop || nextLeft !== lastAppliedLeft

				if (didChange) {
					if (
						quantizedTop !== lastQuantizedTop ||
						quantizedLeft !== lastQuantizedLeft
					) {
						lastQuantizedTop = quantizedTop
						lastQuantizedLeft = quantizedLeft
						batch(() => {
							setScrollTop(nextTop)
							setScrollLeft(nextLeft)
						})
					}
					if (!untrack(isScrolling)) {
						setIsScrolling(true)
					}
					if (nextTop > lastAppliedTop) setScrollDirection('forward')
					else if (nextTop < lastAppliedTop) setScrollDirection('backward')

					lastAppliedTop = nextTop
					lastAppliedLeft = nextLeft
				}
			})
		}

			clearTimeout(scrollTimeoutId)
			scrollTimeoutId = setTimeout(() => setIsScrolling(false), 150)
		}

		element.addEventListener('scroll', onScroll, { passive: true })

		const resizeObserver = new ResizeObserver(() => {
			updateViewportDims()
		})
		resizeObserver.observe(element)
		updateViewportDims()

		onCleanup(() => {
			element.removeEventListener('scroll', onScroll)
			resizeObserver.disconnect()
			if (rafScrollState) cancelAnimationFrame(rafScrollState)
			clearTimeout(scrollTimeoutId)
		})
	})

	const totalSize = createMemo(() =>
		computeTotalHeight2D(options.count(), options.rowHeight())
	)

	const visibleRange = createMemo(
		() => {
			const enabled = options.enabled()
			const count = options.count()
			const range = computeVisibleRange2D({
				enabled,
				count,
				rowHeight: options.rowHeight(),
				charWidth: options.charWidth(),
				scrollTop: scrollTop(),
				scrollLeft: scrollLeft(),
				viewportHeight: viewportHeight(),
				viewportWidth: viewportWidth(),
			})

			if (enabled && count > 0 && range.rowStart > range.rowEnd) {
				return { start: 0, end: 0 }
			}

			return {
				start: range.rowStart,
				end: range.rowEnd,
			}
		},
		{ start: 0, end: 0 },
		{
			equals: (prev, next) =>
				prev.start === next.start && prev.end === next.end,
		}
	)

	const columnWindow = createMemo(
		() => {
			const charWidth = normalizeCharWidth(options.charWidth())
			const left = normalizeNumber(scrollLeft())
			const width = normalizeNumber(viewportWidth())
			const colStartBase = Math.max(0, Math.floor(left / charWidth))
			const visibleCols = Math.max(1, Math.ceil(width / charWidth))
			return { charWidth, colStartBase, visibleCols }
		},
		{ charWidth: 0, colStartBase: 0, visibleCols: 0 },
		{
			equals: (prev, next) =>
				prev.charWidth === next.charWidth &&
				prev.colStartBase === next.colStartBase &&
				prev.visibleCols === next.visibleCols,
		}
	)

	const virtualItemCache = new Map<number, VirtualItemStore>()
	let cachedRowHeight = 0
	let cachedCharWidth = 0

	const createItemStore = (item: VirtualItem2D): VirtualItemStore => {
		const [state, setState] = createStore(item)
		return { state, setState }
	}

	const updateItemStore = (store: VirtualItemStore, next: VirtualItem2D) => {
		const prev = store.state
		if (prev.index !== next.index) store.setState('index', next.index)
		if (prev.start !== next.start) store.setState('start', next.start)
		if (prev.size !== next.size) store.setState('size', next.size)
		if (prev.columnStart !== next.columnStart)
			store.setState('columnStart', next.columnStart)
		if (prev.columnEnd !== next.columnEnd)
			store.setState('columnEnd', next.columnEnd)
		if (prev.lineId !== next.lineId) store.setState('lineId', next.lineId)
	}

	const virtualItems = createMemo<VirtualItem2D[]>(() => {
		const enabled = options.enabled()
		const count = normalizeCount(options.count())
		const rowHeight = normalizeRowHeight(options.rowHeight())
		if (!enabled || count === 0) {
			virtualItemCache.clear()
			cachedRowHeight = rowHeight
			cachedCharWidth = normalizeCharWidth(options.charWidth())
			return []
		}

		const range = visibleRange() // Only vertical part exposed directly
		const { charWidth, colStartBase, visibleCols } = columnWindow()
		const getLineLength = options.getLineLength
		const getLineId = options.getLineId

		return trackMicro(
			'virtualizer-2d.virtualItems',
			() => {
				// Invalidate cache if metrics change
				if (cachedRowHeight !== rowHeight || cachedCharWidth !== charWidth) {
					virtualItemCache.clear()
					cachedRowHeight = rowHeight
					cachedCharWidth = charWidth
				}

				if (range.start > range.end) {
					virtualItemCache.clear()
					return []
				}

				const startIndex = Math.max(0, range.start - overscan)
				const endIndex = Math.min(count - 1, range.end + overscan)

				if (startIndex > endIndex) {
					virtualItemCache.clear()
					return []
				}

				const items: VirtualItem2D[] = []
				const activeKeys = new Set<number>()

				// Horizontal start/end with overscan
				const hStart = Math.max(0, colStartBase - horizontalOverscan)

				for (let i = startIndex; i <= endIndex; i++) {
					const rawLineLen = getLineLength(i)
					const lineLen =
						Number.isFinite(rawLineLen) && rawLineLen > 0
							? Math.floor(rawLineLen)
							: 0

					// THRESHOLD CHECK:
					// If line is short, render everything (no horizontal virtualization overhead)
					// If line is long, slice it
					let cStart = 0
					let cEnd = lineLen

					if (lineLen > VIRTUALIZATION_THRESHOLD) {
						cStart = hStart
						cEnd = Math.min(
							lineLen,
							colStartBase + visibleCols + horizontalOverscan
						)

						// If we scrolled past the end of this specific line
						if (cStart >= lineLen) {
							cStart = 0
							cEnd = 0
						}
					}

					const rawLineId = getLineId(i)
					const lineKey = rawLineId > 0 ? rawLineId : -(i + 1)
					const lineId = rawLineId > 0 ? rawLineId : lineKey
					activeKeys.add(lineKey)

					const nextItem: VirtualItem2D = {
						index: i,
						start: i * rowHeight,
						size: rowHeight,
						columnStart: cStart,
						columnEnd: cEnd,
						lineId,
					}

					let store = virtualItemCache.get(lineKey)
					if (!store) {
						store = createItemStore(nextItem)
						virtualItemCache.set(lineKey, store)
					} else {
						updateItemStore(store, nextItem)
					}

					items.push(store.state)
				}

				for (const key of virtualItemCache.keys()) {
					if (!activeKeys.has(key)) {
						virtualItemCache.delete(key)
					}
				}

				return items
			},
			{
				threshold: 8,
				metadata: {
					count,
					start: range.start,
					end: range.end,
					overscan,
					colStart: colStartBase,
					visibleCols,
				},
			}
		)
	})

	const scrollToBehavior = (
		top: number,
		left: number,
		behavior: ScrollBehavior = 'auto'
	) => {
		const element = options.scrollElement()
		if (element) {
			element.scrollTo({ top, left, behavior })
		}
	}

	const scrollToIndex = (
		index: number,
		{ align = 'auto' }: { align?: 'auto' | 'start' | 'center' | 'end' } = {}
	) => {
		const count = normalizeCount(options.count())
		const rowHeight = normalizeRowHeight(options.rowHeight())
		const height = viewportHeight()

		if (index < 0 || index >= count) return

		let top = index * rowHeight

		if (align === 'center') {
			top -= (height - rowHeight) / 2
		} else if (align === 'end') {
			top -= height - rowHeight
		} else if (align === 'auto') {
			const currentTop = scrollTop()
			const isAboveViewport = top < currentTop
			const isBelowViewport = top + rowHeight > currentTop + height

			if (isBelowViewport) {
				top -= height - rowHeight
			} else if (!isAboveViewport) {
				return
			}
		}

		scrollToBehavior(Math.max(0, top), scrollLeft())
	}

	const scrollToOffset = (offset: number) => {
		scrollToBehavior(offset, scrollLeft())
	}

	return {
		scrollTop,
		scrollLeft,
		viewportHeight,
		viewportWidth,
		virtualItems,
		visibleRange,
		totalSize,
		isScrolling,
		scrollDirection,
		scrollToIndex,
		scrollToOffset,
	}
}
