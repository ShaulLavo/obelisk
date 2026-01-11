/**
 * Custom Horizontal Scrollbar Component
 *
 * Reactive horizontal scrollbar that syncs with the editor's horizontal scroll.
 * Works alongside the existing vertical scrollbar.
 */

import { clsx } from 'clsx'
import {
	createEffect,
	createSignal,
	onCleanup,
	type Accessor,
	type JSX,
} from 'solid-js'
import { useTheme } from '@repo/theme'

export type HorizontalScrollbarProps = {
	/** Height of the scrollbar in pixels */
	height?: number
	/** Custom class name */
	class?: string
	/** Custom styles */
	style?: JSX.CSSProperties
	/** Scroll element accessor */
	scrollElement: Accessor<HTMLElement | null>
}

const SCROLLBAR_HEIGHT = 14
const SCROLLBAR_MIN_THUMB_WIDTH = 20

export const HorizontalScrollbar = (props: HorizontalScrollbarProps) => {
	const { theme } = useTheme()

	const [isHovered, setIsHovered] = createSignal(false)
	const [isDragging, setIsDragging] = createSignal(false)
	const [thumbLeft, setThumbLeft] = createSignal(0)
	const [thumbWidth, setThumbWidth] = createSignal(SCROLLBAR_MIN_THUMB_WIDTH)
	const [containerWidth, setContainerWidth] = createSignal(0)
	const [isVisible, setIsVisible] = createSignal(false)

	let dragState:
		| {
				pointerId: number
				dragOffsetX: number
				thumbWidth: number
		  }
		| undefined

	let containerRef: HTMLDivElement | undefined

	const getScrollElementOrWarn = () => {
		const element = props.scrollElement()
		if (!element) {
			return null
		}
		return element
	}

	const updateScrollState = () => {
		const element = props.scrollElement()
		if (!element || !containerRef) return

		const scrollWidth = element.scrollWidth
		const clientWidth = element.clientWidth
		const scrollLeft = element.scrollLeft

		// Don't show horizontal scrollbar if content fits
		if (scrollWidth <= clientWidth) {
			setIsVisible(false)
			return
		}

		setIsVisible(true)
		const width = containerRef.getBoundingClientRect().width
		setContainerWidth(width)

		// Calculate thumb size proportional to visible content
		const ratio = clientWidth / scrollWidth
		const calculatedThumbWidth = Math.max(
			SCROLLBAR_MIN_THUMB_WIDTH,
			ratio * width
		)
		setThumbWidth(calculatedThumbWidth)

		// Calculate thumb position
		const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
		const scrollRatio =
			maxScrollLeft > 0 ? Math.min(1, scrollLeft / maxScrollLeft) : 0
		const maxThumbLeft = Math.max(0, width - calculatedThumbWidth)
		setThumbLeft(scrollRatio * maxThumbLeft)
	}

	// Listen to scroll events on the scroll element
	createEffect(() => {
		const element = props.scrollElement()
		if (!element) return

		const handleScroll = () => updateScrollState()
		element.addEventListener('scroll', handleScroll, { passive: true })

		// Also listen for resize to update dimensions
		const resizeObserver = new ResizeObserver(() => updateScrollState())
		resizeObserver.observe(element)

		// Initial update
		updateScrollState()

		onCleanup(() => {
			element.removeEventListener('scroll', handleScroll)
			resizeObserver.disconnect()
		})
	})

	// Update on container resize too
	createEffect(() => {
		if (!containerRef) return

		const resizeObserver = new ResizeObserver(() => updateScrollState())
		resizeObserver.observe(containerRef)

		onCleanup(() => resizeObserver.disconnect())
	})

	const handlePointerDown = (event: PointerEvent) => {
		event.preventDefault()

		const element = getScrollElementOrWarn()
		if (!element || !containerRef) return

		const rect = containerRef.getBoundingClientRect()
		const localX = Math.max(
			0,
			Math.min(containerWidth(), event.clientX - rect.left)
		)
		const isOnThumb =
			localX >= thumbLeft() && localX <= thumbLeft() + thumbWidth()

		if (isOnThumb) {
			dragState = {
				pointerId: event.pointerId,
				dragOffsetX: localX - thumbLeft(),
				thumbWidth: thumbWidth(),
			}
			containerRef.setPointerCapture(event.pointerId)
			setIsDragging(true)
		} else {
			// Click on track - jump to that position
			const width = containerWidth()
			const centerX = localX - thumbWidth() / 2
			const maxThumbLeft = Math.max(0, width - thumbWidth())
			const ratio = maxThumbLeft > 0 ? centerX / maxThumbLeft : 0

			const scrollWidth = element.scrollWidth
			const clientWidth = element.clientWidth
			const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)

			element.scrollLeft = Math.max(
				0,
				Math.min(maxScrollLeft, ratio * maxScrollLeft)
			)
		}
	}

	const handlePointerMove = (event: PointerEvent) => {
		if (!dragState || event.pointerId !== dragState.pointerId) return

		const element = getScrollElementOrWarn()
		if (!element || !containerRef) return

		const rect = containerRef.getBoundingClientRect()
		const width = containerWidth()

		const localX = Math.max(0, Math.min(width, event.clientX - rect.left))
		const newThumbLeft = localX - dragState.dragOffsetX

		const maxThumbLeft = Math.max(0, width - dragState.thumbWidth)
		const ratio = maxThumbLeft > 0 ? newThumbLeft / maxThumbLeft : 0

		const scrollWidth = element.scrollWidth
		const clientWidth = element.clientWidth
		const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)

		element.scrollLeft = Math.max(
			0,
			Math.min(maxScrollLeft, ratio * maxScrollLeft)
		)
	}

	const handlePointerUp = (event: PointerEvent) => {
		if (dragState && event.pointerId === dragState.pointerId) {
			containerRef?.releasePointerCapture(event.pointerId)
			dragState = undefined
			setIsDragging(false)
		}
	}

	const handleWheel = (event: WheelEvent) => {
		event.preventDefault()
		const element = getScrollElementOrWarn()
		if (element) {
			// For horizontal scrollbar, use deltaX or shift+deltaY
			element.scrollLeft += event.deltaX || event.deltaY
		}
	}

	return (
		<div
			ref={containerRef}
			class={clsx('horizontal-scrollbar-container', props.class)}
			style={{
				height: `${props.height ?? SCROLLBAR_HEIGHT}px`,
				'flex-shrink': 0,
				display: isVisible() ? 'block' : 'none',
				...props.style,
			}}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerLeave={handlePointerUp}
			on:wheel={{ passive: false, handleEvent: handleWheel }}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Track */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					'background-color': 'transparent',
				}}
			/>
			{/* Thumb - square, transparent, blur */}
			<div
				style={{
					position: 'absolute',
					top: '2px',
					bottom: '2px',
					left: `${thumbLeft()}px`,
					width: `${thumbWidth()}px`,
					'background-color':
						theme.editor.scrollbarThumb ??
						(isDragging()
							? 'rgba(255, 255, 255, 0.3)'
							: isHovered()
								? 'rgba(255, 255, 255, 0.12)'
								: 'rgba(255, 255, 255, 0.08)'),
					opacity: isDragging() ? 0.8 : isHovered() ? 0.6 : 0.4,
					'border-radius': '0px',
					transition: isDragging() ? 'none' : 'background-color 0.15s ease',
					'backdrop-filter': 'blur(4px)',
				}}
			/>
		</div>
	)
}
