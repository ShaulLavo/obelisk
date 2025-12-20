import {
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	untrack,
	type Accessor,
} from 'solid-js'
import { loggers } from '@repo/logger'
import type { VirtualItem, VirtualItem2D } from '../types'

export type Virtualizer2DOptions = {
	count: Accessor<number>
	enabled: Accessor<boolean>
	scrollElement: Accessor<HTMLElement | null>
	rowHeight: Accessor<number>
	charWidth: Accessor<number>
	overscan: number
	horizontalOverscan?: number
	// Map of line index -> line length (in characters)
	lineLengths: Accessor<Map<number, number>>
}

export type Virtualizer2D = {
	scrollTop: Accessor<number>
	scrollLeft: Accessor<number>
	viewportHeight: Accessor<number>
	viewportWidth: Accessor<number>
	virtualItems: Accessor<VirtualItem2D[]>
	visibleRange: Accessor<{ start: number; end: number }>
	totalSize: Accessor<number>
	totalWidth: Accessor<number>
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
	// We don't need lineLengths here, just viewport dimensions
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
	const log = loggers.codeEditor.withTag('virtualizer-2d')
	const [scrollTop, setScrollTop] = createSignal(0)
	const [scrollLeft, setScrollLeft] = createSignal(0)
	const [viewportHeight, setViewportHeight] = createSignal(0)
	const [viewportWidth, setViewportWidth] = createSignal(0)
	const [isScrolling, setIsScrolling] = createSignal(false)
	const [scrollDirection, setScrollDirection] = createSignal<
		'forward' | 'backward' | null
	>(null)

	// Scroll handler setup
	createEffect(() => {
		const enabled = options.enabled()
		const element = options.scrollElement()

		if (!enabled) return
		if (!element) return

		// Initial Sync
		setScrollTop(normalizeNumber(element.scrollTop))
		setScrollLeft(normalizeNumber(element.scrollLeft))

		let warnedZeroDims = false
		const updateViewportDims = () => {
			const height = normalizeNumber(element.clientHeight)
			const width = normalizeNumber(element.clientWidth)
			setViewportHeight(height)
			setViewportWidth(width)

			if (height === 0 || width === 0) {
				if (warnedZeroDims) return
				warnedZeroDims = true
				log.warn('Virtualizer scrollElement has zero dimensions', {
					height,
					width,
				})
			} else {
				warnedZeroDims = false
			}
		}

		log.debug('2D Virtualizer attached')

		let rafId = 0
		let scrollTimeoutId: ReturnType<typeof setTimeout>

		const onScroll = () => {
			if (rafId) return

			// Detect scrolling state
			setIsScrolling(true)
			clearTimeout(scrollTimeoutId)
			scrollTimeoutId = setTimeout(() => setIsScrolling(false), 150)

			// Detect direction (vertical only for now as it's more critical)
			const currentTop = normalizeNumber(element.scrollTop)
			const prevTop = untrack(scrollTop)
			if (currentTop > prevTop) setScrollDirection('forward')
			else if (currentTop < prevTop) setScrollDirection('backward')

			rafId = requestAnimationFrame(() => {
				rafId = 0
				setScrollTop(currentTop)
				setScrollLeft(normalizeNumber(element.scrollLeft))
			})
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
			if (rafId) cancelAnimationFrame(rafId)
			clearTimeout(scrollTimeoutId)
			log.debug('2D Virtualizer detached')
		})
	})

	const totalSize = createMemo(() =>
		computeTotalHeight2D(options.count(), options.rowHeight())
	)

	const totalWidth = createMemo(() => {
		// Calculate max line length * char width
		let maxLen = 0
		options.lineLengths().forEach((len) => {
			if (len > maxLen) maxLen = len
		})
		return maxLen * normalizeCharWidth(options.charWidth())
	})

	const visibleRange = createMemo(() => {
		const range = computeVisibleRange2D({
			enabled: options.enabled(),
			count: options.count(),
			rowHeight: options.rowHeight(),
			charWidth: options.charWidth(),
			scrollTop: scrollTop(),
			scrollLeft: scrollLeft(),
			viewportHeight: viewportHeight(),
			viewportWidth: viewportWidth(),
		})

		return {
			start: range.rowStart,
			end: range.rowEnd,
		}
	})

	const virtualItemCache = new Map<number, VirtualItem2D>()
	let cachedRowHeight = 0
	let cachedCharWidth = 0

	const virtualItems = createMemo<VirtualItem2D[]>(() => {
		const enabled = options.enabled()
		const count = normalizeCount(options.count())
		const rowHeight = normalizeRowHeight(options.rowHeight())
		const charWidth = normalizeCharWidth(options.charWidth())
		const range = visibleRange() // Only vertical part exposed directly
		const overscan = Math.max(0, options.overscan)
		const horizontalOverscan = Math.max(0, options.horizontalOverscan ?? 20)

		// Re-calculate basic visible range values for horizontal slice
		const left = scrollLeft()
		const width = viewportWidth()

		const colStartBase = Math.max(0, Math.floor(left / charWidth))
		const visibleCols = Math.max(1, Math.ceil(width / charWidth))
		// const colEndBase = colStartBase + visibleCols // Unused here, we add overscan immediately

		if (!enabled || count === 0) {
			virtualItemCache.clear()
			cachedRowHeight = rowHeight
			cachedCharWidth = charWidth
			return []
		}

		// Invalidate cache if metrics change
		if (cachedRowHeight !== rowHeight || cachedCharWidth !== charWidth) {
			virtualItemCache.clear()
			cachedRowHeight = rowHeight
			cachedCharWidth = charWidth
		}

		const startIndex = Math.max(0, range.start - overscan)
		const endIndex = Math.min(count - 1, range.end + overscan)
		const lineLengths = options.lineLengths()

		// GC: Clean up cache for rows no longer visible
		for (const index of virtualItemCache.keys()) {
			if (index < startIndex || index > endIndex) {
				virtualItemCache.delete(index)
			}
		}

		const items: VirtualItem2D[] = []

		// Horizontal start/end with overscan
		const hStart = Math.max(0, colStartBase - horizontalOverscan)
		// We don't clamp hEnd here because it depends on line length, done per item

		for (let i = startIndex; i <= endIndex; i++) {
			const lineLen = lineLengths.get(i) ?? 0

			// THRESHOLD CHECK:
			// If line is short, render everything (no horizontal virtualization overhead)
			// If line is long, slice it
			let cStart = 0
			let cEnd = lineLen // Render full line by default

			if (lineLen > VIRTUALIZATION_THRESHOLD) {
				cStart = hStart
				cEnd = Math.min(
					lineLen,
					colStartBase + visibleCols + horizontalOverscan
				)

				// If we scrolled past the end of this specific line
				if (cStart >= lineLen) {
					cStart = 0
					cEnd = 0 // Line not visible horizontally
				}
			}

			// Cache check
			// We need to invalidate item if column range changed significantly
			let item = virtualItemCache.get(i)
			if (item) {
				if (item.columnStart !== cStart || item.columnEnd !== cEnd) {
					// Update existing item in place or create new?
					// Creating new is safer for reactivity
					item = {
						index: i,
						start: i * rowHeight,
						size: rowHeight,
						columnStart: cStart,
						columnEnd: cEnd,
					}
					virtualItemCache.set(i, item)
				}
			} else {
				item = {
					index: i,
					start: i * rowHeight,
					size: rowHeight,
					columnStart: cStart,
					columnEnd: cEnd,
				}
				virtualItemCache.set(i, item)
			}

			items.push(item)
		}

		return items
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

		// Adjust based on alignment
		if (align === 'center') {
			top -= (height - rowHeight) / 2
		} else if (align === 'end') {
			top -= height - rowHeight
		} else if (align === 'auto') {
			const currentTop = scrollTop()
			if (top < currentTop) {
				// Already correct (align=start implicitly)
			} else if (top + rowHeight > currentTop + height) {
				top -= height - rowHeight
			} else {
				// Already visible
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
		totalWidth,
		isScrolling,
		scrollDirection,
		scrollToIndex,
		scrollToOffset,
	}
}
