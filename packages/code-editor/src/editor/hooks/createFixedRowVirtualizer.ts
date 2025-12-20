import {
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	untrack,
	type Accessor,
} from 'solid-js'
import { loggers } from '@repo/logger'
import type { VirtualItem } from '../types'

export type ScrollAlignment = 'start' | 'center' | 'end' | 'auto'
export type ScrollDirection = 'forward' | 'backward' | null

export type ScrollToIndexOptions = {
	align?: ScrollAlignment
	behavior?: ScrollBehavior
}

export type ScrollToOffsetOptions = {
	behavior?: ScrollBehavior
}

export type FixedRowVirtualizerOptions = {
	count: Accessor<number>
	enabled: Accessor<boolean>
	scrollElement: Accessor<HTMLElement | null>
	rowHeight: Accessor<number>
	overscan: number
}

export type FixedRowVirtualizer = {
	scrollTop: Accessor<number>
	viewportHeight: Accessor<number>
	virtualItems: Accessor<VirtualItem[]>
	visibleRange: Accessor<{ start: number; end: number }>
	totalSize: Accessor<number>
	isScrolling: Accessor<boolean>
	scrollDirection: Accessor<ScrollDirection>
	scrollToIndex: (index: number, options?: ScrollToIndexOptions) => void
	scrollToOffset: (offset: number, options?: ScrollToOffsetOptions) => void
}

export type FixedRowVisibleRange = {
	start: number
	end: number
}

const normalizeNumber = (value: number): number =>
	Number.isFinite(value) ? value : 0

const normalizeCount = (count: number): number =>
	Number.isFinite(count) && count > 0 ? Math.floor(count) : 0

const normalizeRowHeight = (value: number): number =>
	Number.isFinite(value) && value > 0 ? value : 1

export const computeFixedRowTotalSize = (
	count: number,
	rowHeight: number
): number => normalizeCount(count) * normalizeRowHeight(rowHeight)

export const computeFixedRowVisibleRange = (options: {
	enabled: boolean
	count: number
	rowHeight: number
	scrollTop: number
	viewportHeight: number
}): FixedRowVisibleRange => {
	const count = normalizeCount(options.count)
	if (!options.enabled || count === 0) return { start: 0, end: 0 }

	const rowHeight = normalizeRowHeight(options.rowHeight)
	const top = normalizeNumber(options.scrollTop)
	const height = normalizeNumber(options.viewportHeight)

	const start = Math.max(0, Math.min(count - 1, Math.floor(top / rowHeight)))
	const visibleCount = Math.max(
		1,
		Math.ceil((height + rowHeight - 1) / rowHeight)
	)
	const end = Math.max(start, Math.min(count - 1, start + visibleCount - 1))

	return { start, end }
}

export const computeFixedRowVirtualItems = (options: {
	enabled: boolean
	count: number
	rowHeight: number
	range: FixedRowVisibleRange
	overscan: number
}): VirtualItem[] => {
	const count = normalizeCount(options.count)
	if (!options.enabled || count === 0) return []

	const rowHeight = normalizeRowHeight(options.rowHeight)
	const overscan = Math.max(0, options.overscan)

	const startIndex = Math.max(0, options.range.start - overscan)
	const endIndex = Math.min(count - 1, options.range.end + overscan)

	const items: VirtualItem[] = []
	for (let i = startIndex; i <= endIndex; i++) {
		items.push({
			index: i,
			start: i * rowHeight,
			size: rowHeight,
		})
	}

	return items
}

export function createFixedRowVirtualizer(
	options: FixedRowVirtualizerOptions
): FixedRowVirtualizer {
	const log = loggers.codeEditor.withTag('virtualizer')
	const [scrollTop, setScrollTop] = createSignal(0)
	const [viewportHeight, setViewportHeight] = createSignal(0)
	const [isScrolling, setIsScrolling] = createSignal(false)
	const [scrollDirection, setScrollDirection] =
		createSignal<ScrollDirection>(null)

	// Store ref to element for imperative scroll methods
	let scrollElementRef: HTMLElement | null = null

	createEffect(() => {
		const enabled = options.enabled()
		const element = options.scrollElement()
		scrollElementRef = element

		if (!enabled) return
		if (!element) {
			const message = 'Virtualizer enabled but scrollElement is null'
			log.warn(message)
			console.assert(false, message)
			return
		}

		setScrollTop(normalizeNumber(element.scrollTop))

		let warnedZeroHeight = false
		const updateViewportHeight = (height: number) => {
			setViewportHeight(height)

			if (height === 0) {
				if (warnedZeroHeight) return
				warnedZeroHeight = true
				const message =
					'Virtualizer scrollElement has clientHeight=0 (will render only overscan rows)'
				log.warn(message, {
					scrollTop: element.scrollTop,
					clientHeight: element.clientHeight,
					offsetHeight: element.offsetHeight,
					count: untrack(() => options.count()),
					rowHeight: untrack(() => options.rowHeight()),
				})
				console.assert(false, message)
			} else if (warnedZeroHeight) {
				warnedZeroHeight = false
				log.debug('Virtualizer scrollElement height recovered', {
					clientHeight: height,
				})
			}
		}

		log.debug('Virtualizer attached', {
			overscan: options.overscan,
			count: untrack(() => options.count()),
			rowHeight: untrack(() => options.rowHeight()),
		})

		let rafId = 0
		let prevScrollTop = element.scrollTop

		const onScroll = () => {
			if (rafId) return
			rafId = requestAnimationFrame(() => {
				rafId = 0
				const newScrollTop = normalizeNumber(element.scrollTop)

				// Update scroll direction
				if (newScrollTop !== prevScrollTop) {
					setScrollDirection(
						newScrollTop > prevScrollTop ? 'forward' : 'backward'
					)
				}
				prevScrollTop = newScrollTop

				setIsScrolling(true)
				setScrollTop(newScrollTop)
			})
		}

		const onScrollEnd = () => {
			setIsScrolling(false)
			setScrollDirection(null)
		}

		element.addEventListener('scroll', onScroll, { passive: true })
		element.addEventListener('scrollend', onScrollEnd, { passive: true })

		// Use borderBoxSize for more accurate sizing
		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0]
			if (entry?.borderBoxSize?.[0]) {
				const height = Math.round(entry.borderBoxSize[0].blockSize)
				updateViewportHeight(height)
			} else {
				updateViewportHeight(normalizeNumber(element.clientHeight))
			}
		})
		resizeObserver.observe(element, { box: 'border-box' })
		updateViewportHeight(normalizeNumber(element.clientHeight))

		onCleanup(() => {
			element.removeEventListener('scroll', onScroll)
			element.removeEventListener('scrollend', onScrollEnd)
			resizeObserver.disconnect()
			if (rafId) {
				cancelAnimationFrame(rafId)
			}
			scrollElementRef = null
			log.debug('Virtualizer detached')
		})
	})

	const totalSize = createMemo(() =>
		computeFixedRowTotalSize(options.count(), options.rowHeight())
	)

	const visibleRange = createMemo(
		() =>
			computeFixedRowVisibleRange({
				enabled: options.enabled(),
				count: options.count(),
				rowHeight: options.rowHeight(),
				scrollTop: scrollTop(),
				viewportHeight: viewportHeight(),
			}),
		{ start: 0, end: 0 },
		{
			equals: (prev, next) =>
				prev.start === next.start && prev.end === next.end,
		}
	)

	const virtualItemCache = new Map<number, VirtualItem>()
	let cachedRowHeight = 0

	const virtualItems = createMemo<VirtualItem[]>(() => {
		const enabled = options.enabled()
		const count = normalizeCount(options.count())
		const rowHeight = normalizeRowHeight(options.rowHeight())
		const range = visibleRange()
		const overscan = Math.max(0, options.overscan)

		if (!enabled || count === 0) {
			virtualItemCache.clear()
			cachedRowHeight = rowHeight
			return []
		}

		if (cachedRowHeight !== rowHeight) {
			virtualItemCache.clear()
			cachedRowHeight = rowHeight
		}

		const startIndex = Math.max(0, range.start - overscan)
		const endIndex = Math.min(count - 1, range.end + overscan)

		for (const index of virtualItemCache.keys()) {
			if (index < startIndex || index > endIndex) {
				virtualItemCache.delete(index)
			}
		}

		const items: VirtualItem[] = []
		for (let i = startIndex; i <= endIndex; i++) {
			let item = virtualItemCache.get(i)
			if (!item) {
				item = {
					index: i,
					start: i * rowHeight,
					size: rowHeight,
				}
				virtualItemCache.set(i, item)
			}
			items.push(item)
		}

		return items
	})

	const scrollToOffset = (offset: number, opts: ScrollToOffsetOptions = {}) => {
		const element = scrollElementRef
		if (!element) return

		const maxOffset = totalSize() - viewportHeight()
		const clampedOffset = Math.max(0, Math.min(offset, maxOffset))

		element.scrollTo({
			top: clampedOffset,
			behavior: opts.behavior ?? 'auto',
		})
	}

	const scrollToIndex = (index: number, opts: ScrollToIndexOptions = {}) => {
		const element = scrollElementRef
		if (!element) return

		const count = options.count()
		const rowHeight = options.rowHeight()
		const height = viewportHeight()

		// Clamp index to valid range
		const clampedIndex = Math.max(0, Math.min(index, count - 1))
		const itemStart = clampedIndex * rowHeight
		const itemEnd = itemStart + rowHeight

		const currentScrollTop = scrollTop()
		const align = opts.align ?? 'auto'

		let targetOffset: number

		switch (align) {
			case 'start':
				targetOffset = itemStart
				break

			case 'center':
				targetOffset = itemStart - (height - rowHeight) / 2
				break

			case 'end':
				targetOffset = itemEnd - height
				break

			case 'auto':
			default:
				// Only scroll if item is not fully visible
				if (
					itemStart >= currentScrollTop &&
					itemEnd <= currentScrollTop + height
				) {
					// Already fully visible, don't scroll
					return
				}
				// Scroll to bring into view with minimal movement
				if (itemStart < currentScrollTop) {
					// Item is above viewport, scroll up to show at top
					targetOffset = itemStart
				} else {
					// Item is below viewport, scroll down to show at bottom
					targetOffset = itemEnd - height
				}
				break
		}

		scrollToOffset(targetOffset, { behavior: opts.behavior })
	}

	return {
		scrollTop,
		viewportHeight,
		virtualItems,
		visibleRange,
		totalSize,
		isScrolling,
		scrollDirection,
		scrollToIndex,
		scrollToOffset,
	}
}
