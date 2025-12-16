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

	createEffect(() => {
		const enabled = options.enabled()
		const element = options.scrollElement()

		if (!enabled) return
		if (!element) {
			const message = 'Virtualizer enabled but scrollElement is null'
			log.warn(message)
			console.assert(false, message)
			return
		}

		setScrollTop(normalizeNumber(element.scrollTop))

		let warnedZeroHeight = false
		const updateViewportHeight = () => {
			const height = normalizeNumber(element.clientHeight)
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
		const onScroll = () => {
			if (rafId) return
			rafId = requestAnimationFrame(() => {
				rafId = 0
				setScrollTop(normalizeNumber(element.scrollTop))
			})
		}

		element.addEventListener('scroll', onScroll, { passive: true })

		const resizeObserver = new ResizeObserver(() => {
			updateViewportHeight()
		})
		resizeObserver.observe(element)
		updateViewportHeight()

		onCleanup(() => {
			element.removeEventListener('scroll', onScroll)
			resizeObserver.disconnect()
			if (rafId) {
				cancelAnimationFrame(rafId)
			}
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

	return {
		scrollTop,
		viewportHeight,
		virtualItems,
		visibleRange,
		totalSize,
	}
}
