import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js'

export type ScrollbarOrientation = 'vertical' | 'horizontal'

export type ScrollbarSource = {
	getScrollSize: () => number
	getClientSize: () => number
	getScrollOffset: () => number
	setScrollOffset: (offset: number) => void
	scrollBy?: (delta: number) => void
	subscribe?: (listener: () => void) => () => void
}

export type UseScrollbarOptions = {
	source?: Accessor<ScrollbarSource | null>
	scrollElement?: Accessor<HTMLElement | null>
	orientation?: ScrollbarOrientation
	minThumbSize?: number
}

const DEFAULT_MIN_THUMB_SIZE = 20

export const useScrollbar = (options: UseScrollbarOptions) => {
	const [thumbOffset, setThumbOffset] = createSignal(0)
	const [thumbSize, setThumbSize] = createSignal(DEFAULT_MIN_THUMB_SIZE)
	const [isVisible, setIsVisible] = createSignal(false)
	const [containerSize, setContainerSize] = createSignal(0)

	let containerRef: HTMLDivElement | null = null
	let containerObserver: ResizeObserver | null = null

	const getOrientation = () => options.orientation ?? 'vertical'
	const getMinThumbSize = () => options.minThumbSize ?? DEFAULT_MIN_THUMB_SIZE
	const getSource = () => (options.source ? options.source() : null)

	const clamp = (value: number, min: number, max: number) =>
		Math.max(min, Math.min(max, value))

	const getElementMetrics = () => {
		const element = options.scrollElement?.()
		if (!element) return null

		if (getOrientation() === 'horizontal') {
			return {
				scrollSize: element.scrollWidth,
				clientSize: element.clientWidth,
				scrollOffset: element.scrollLeft,
				setScrollOffset: (offset: number) => {
					element.scrollLeft = offset
				},
				scrollBy: (delta: number) => {
					element.scrollLeft += delta
				},
			}
		}

		return {
			scrollSize: element.scrollHeight,
			clientSize: element.clientHeight,
			scrollOffset: element.scrollTop,
			setScrollOffset: (offset: number) => {
				element.scrollTop = offset
			},
			scrollBy: (delta: number) => {
				element.scrollTop += delta
			},
		}
	}

	const getMetrics = () => {
		const source = getSource()
		if (source) {
			return {
				scrollSize: source.getScrollSize(),
				clientSize: source.getClientSize(),
				scrollOffset: source.getScrollOffset(),
				setScrollOffset: source.setScrollOffset,
				scrollBy: source.scrollBy,
			}
		}
		return getElementMetrics()
	}

	const updateThumb = () => {
		const metrics = getMetrics()
		const size = containerSize()

		if (!metrics || size <= 0) {
			setIsVisible(false)
			setThumbOffset(0)
			setThumbSize(getMinThumbSize())
			return
		}

		const maxScroll = Math.max(0, metrics.scrollSize - metrics.clientSize)
		if (maxScroll <= 0 || metrics.scrollSize <= 0) {
			setIsVisible(false)
			setThumbOffset(0)
			setThumbSize(Math.max(getMinThumbSize(), size))
			return
		}

		const ratio = clamp(metrics.scrollOffset / maxScroll, 0, 1)
		const nextThumbSize = Math.max(
			getMinThumbSize(),
			(metrics.clientSize / metrics.scrollSize) * size
		)
		const maxThumbOffset = Math.max(0, size - nextThumbSize)

		setIsVisible(true)
		setThumbSize(nextThumbSize)
		setThumbOffset(ratio * maxThumbOffset)
	}

	const scrollToRatio = (ratio: number) => {
		const metrics = getMetrics()
		if (!metrics) return

		const maxScroll = Math.max(0, metrics.scrollSize - metrics.clientSize)
		if (maxScroll <= 0) return

		metrics.setScrollOffset(clamp(ratio, 0, 1) * maxScroll)
	}

	const scrollBy = (delta: number) => {
		const metrics = getMetrics()
		if (!metrics) return

		if (metrics.scrollBy) {
			metrics.scrollBy(delta)
			return
		}

		const maxScroll = Math.max(0, metrics.scrollSize - metrics.clientSize)
		const next = clamp(metrics.scrollOffset + delta, 0, maxScroll)
		metrics.setScrollOffset(next)
	}

	const setContainerRef = (element: HTMLDivElement) => {
		if (containerObserver) {
			containerObserver.disconnect()
			containerObserver = null
		}

		containerRef = element
		if (!containerRef) return

		containerObserver = new ResizeObserver(() => {
			const rect = containerRef?.getBoundingClientRect()
			if (!rect) return

			const size = getOrientation() === 'horizontal' ? rect.width : rect.height
			setContainerSize(size)
			updateThumb()
		})

		containerObserver.observe(containerRef)

		const rect = containerRef.getBoundingClientRect()
		const size = getOrientation() === 'horizontal' ? rect.width : rect.height
		setContainerSize(size)
		updateThumb()
	}

	createEffect(() => {
		const source = getSource()
		if (source?.subscribe) {
			const unsubscribe = source.subscribe(updateThumb)
			updateThumb()
			onCleanup(() => unsubscribe())
			return
		}

		const element = options.scrollElement?.()
		if (!element) {
			updateThumb()
			return
		}

		const handleScroll = () => updateThumb()
		element.addEventListener('scroll', handleScroll, { passive: true })

		const resizeObserver = new ResizeObserver(handleScroll)
		resizeObserver.observe(element)

		updateThumb()

		onCleanup(() => {
			element.removeEventListener('scroll', handleScroll)
			resizeObserver.disconnect()
		})
	})

	onCleanup(() => {
		if (containerObserver) {
			containerObserver.disconnect()
		}
		containerObserver = null
		containerRef = null
	})

	return {
		thumbOffset,
		thumbSize,
		isVisible,
		setContainerRef,
		scrollToRatio,
		scrollBy,
	}
}
