import { clsx } from 'clsx'
import { createSignal, type JSX } from 'solid-js'
import type { ScrollbarOrientation } from './useScrollbar'

export type ScrollbarThumbState = {
	isHovered: boolean
	isDragging: boolean
}

export type ScrollbarProps = {
	orientation?: ScrollbarOrientation
	size?: number
	class?: string
	style?: JSX.CSSProperties
	trackStyle?: JSX.CSSProperties
	thumbStyle?:
		| JSX.CSSProperties
		| ((state: ScrollbarThumbState) => JSX.CSSProperties)
	thumbOffset: () => number
	thumbSize: () => number
	isVisible?: () => boolean
	onScrollTo: (ratio: number) => void
	onScrollBy?: (delta: number) => void
	containerRef?: (element: HTMLDivElement) => void
}

const DEFAULT_SIZE = 14
const DEFAULT_THUMB_INSET = 2

export const Scrollbar = (props: ScrollbarProps) => {
	const [isHovered, setIsHovered] = createSignal(false)
	const [isDragging, setIsDragging] = createSignal(false)

	let containerRef: HTMLDivElement | undefined
	let dragState:
		| {
				pointerId: number
				dragOffset: number
				thumbSize: number
		  }
		| undefined

	const clamp = (value: number, min: number, max: number) =>
		Math.max(min, Math.min(max, value))

	const isVertical = () => (props.orientation ?? 'vertical') === 'vertical'
	const isVisible = () => (props.isVisible ? props.isVisible() : true)
	const trackSize = () => props.size ?? DEFAULT_SIZE

	const resolveThumbStyle = () => {
		const base: JSX.CSSProperties = {
			'background-color': isDragging()
				? 'rgba(255, 255, 255, 0.3)'
				: isHovered()
					? 'rgba(255, 255, 255, 0.12)'
					: 'rgba(255, 255, 255, 0.08)',
			opacity: isDragging() ? 0.8 : isHovered() ? 0.6 : 0.4,
			'border-radius': '0px',
			transition: isDragging() ? 'none' : 'background-color 0.15s ease',
			'backdrop-filter': 'blur(4px)',
		}

		if (!props.thumbStyle) return base
		if (typeof props.thumbStyle === 'function') {
			return {
				...base,
				...props.thumbStyle({
					isHovered: isHovered(),
					isDragging: isDragging(),
				}),
			}
		}

		return { ...base, ...props.thumbStyle }
	}

	const getContainerRect = () => containerRef?.getBoundingClientRect()

	const getLocalOffset = (event: PointerEvent) => {
		const rect = getContainerRect()
		if (!rect) return 0
		return isVertical() ? event.clientY - rect.top : event.clientX - rect.left
	}

	const getTrackLength = () => {
		const rect = getContainerRect()
		if (!rect) return 0
		return isVertical() ? rect.height : rect.width
	}

	const handlePointerDown = (event: PointerEvent) => {
		if (!isVisible()) return
		event.preventDefault()

		const localOffset = getLocalOffset(event)
		const trackLength = getTrackLength()
		if (trackLength <= 0) return

		const currentThumbOffset = props.thumbOffset()
		const currentThumbSize = props.thumbSize()

		const isOnThumb =
			localOffset >= currentThumbOffset &&
			localOffset <= currentThumbOffset + currentThumbSize

		if (isOnThumb) {
			dragState = {
				pointerId: event.pointerId,
				dragOffset: localOffset - currentThumbOffset,
				thumbSize: currentThumbSize,
			}
			containerRef?.setPointerCapture(event.pointerId)
			setIsDragging(true)
			return
		}

		const maxThumbOffset = Math.max(0, trackLength - currentThumbSize)
		const targetOffset = localOffset - currentThumbSize / 2
		const ratio =
			maxThumbOffset > 0
				? clamp(targetOffset, 0, maxThumbOffset) / maxThumbOffset
				: 0

		props.onScrollTo(ratio)
	}

	const handlePointerMove = (event: PointerEvent) => {
		if (!dragState || event.pointerId !== dragState.pointerId) return

		const trackLength = getTrackLength()
		if (trackLength <= 0) return

		const localOffset = getLocalOffset(event)
		const targetOffset = localOffset - dragState.dragOffset
		const maxThumbOffset = Math.max(0, trackLength - dragState.thumbSize)
		const ratio =
			maxThumbOffset > 0
				? clamp(targetOffset, 0, maxThumbOffset) / maxThumbOffset
				: 0

		props.onScrollTo(ratio)
	}

	const handlePointerUp = (event: PointerEvent) => {
		if (dragState && event.pointerId === dragState.pointerId) {
			containerRef?.releasePointerCapture(event.pointerId)
			dragState = undefined
			setIsDragging(false)
		}
	}

	const handleWheel = (event: WheelEvent) => {
		if (!props.onScrollBy || !isVisible()) return
		event.preventDefault()

		const delta = isVertical() ? event.deltaY : event.deltaX || event.deltaY

		props.onScrollBy(delta)
	}

	const setContainerRef = (element: HTMLDivElement) => {
		containerRef = element
		props.containerRef?.(element)
	}

	return (
		<div
			ref={setContainerRef}
			class={clsx('scrollbar-container', props.class)}
			style={{
				position: 'relative',
				'flex-shrink': 0,
				width: isVertical() ? `${trackSize()}px` : '100%',
				height: isVertical() ? '100%' : `${trackSize()}px`,
				opacity: isVisible() ? 1 : 0,
				'pointer-events': isVisible() ? 'auto' : 'none',
				...props.style,
			}}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onPointerLeave={handlePointerUp}
			on:wheel={{ passive: false, handleEvent: handleWheel }}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					'background-color': 'transparent',
					...props.trackStyle,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					top: isVertical()
						? `${props.thumbOffset()}px`
						: `${DEFAULT_THUMB_INSET}px`,
					left: isVertical()
						? `${DEFAULT_THUMB_INSET}px`
						: `${props.thumbOffset()}px`,
					right: isVertical() ? `${DEFAULT_THUMB_INSET}px` : undefined,
					bottom: isVertical() ? undefined : `${DEFAULT_THUMB_INSET}px`,
					height: isVertical() ? `${props.thumbSize()}px` : undefined,
					width: isVertical() ? undefined : `${props.thumbSize()}px`,
					...resolveThumbStyle(),
				}}
			/>
		</div>
	)
}
