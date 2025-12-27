import { clsx } from 'clsx'
import { createEffect, createSignal, onCleanup, type JSX } from 'solid-js'
import { loggers } from '@repo/logger'
import { useScrollState } from './ScrollState'
import { useTheme } from '@repo/theme'
import styles from './Scrollbar.module.css'

export type ScrollbarProps = {
	width?: number
	class?: string
	style?: JSX.CSSProperties
}

const SCROLLBAR_WIDTH = 14
const SCROLLBAR_MIN_THUMB_HEIGHT = 20
const NATIVE_SCROLLBAR_HIDE_CLASS = styles['scrollbar-hidden']!

export const Scrollbar = (props: ScrollbarProps) => {
	const { scrollState, scrollElement } = useScrollState()
	const { theme } = useTheme()
	const log = loggers.codeEditor.withTag('scrollbar')

	const [isHovered, setIsHovered] = createSignal(false)
	const [isDragging, setIsDragging] = createSignal(false)

	let dragState:
		| {
				pointerId: number
				dragOffsetY: number
				thumbHeight: number
		  }
		| undefined

	let containerRef: HTMLDivElement | undefined
	let lastScrollElement: HTMLElement | null = null
	let warnedMissingClass = false

	// Read from shared store
	const thumbTop = () => scrollState.sliderTop
	const thumbHeight = () =>
		Math.max(SCROLLBAR_MIN_THUMB_HEIGHT, scrollState.sliderHeight)

	const syncNativeScrollbar = (element: HTMLElement | null) => {
		if (!NATIVE_SCROLLBAR_HIDE_CLASS) {
			if (!warnedMissingClass) {
				warnedMissingClass = true
				const message = 'Scrollbar CSS module class is missing'
				log.warn(message)
			}
			return
		}
		if (element === lastScrollElement) return

		if (lastScrollElement) {
			lastScrollElement.classList.remove(NATIVE_SCROLLBAR_HIDE_CLASS)
			log.debug('Native scrollbar restored', {
				className: NATIVE_SCROLLBAR_HIDE_CLASS,
			})
		}

		lastScrollElement = element
		if (!element) return

		element.classList.add(NATIVE_SCROLLBAR_HIDE_CLASS)
		log.debug('Native scrollbar disabled', {
			className: NATIVE_SCROLLBAR_HIDE_CLASS,
		})
	}

	const getScrollElementOrWarn = (context: string) => {
		const element = scrollElement()
		if (!element) {
			const message = `Scrollbar ${context} ignored: missing scroll element`
			log.warn(message)

			return null
		}
		return element
	}

	createEffect(() => {
		syncNativeScrollbar(scrollElement())
	})

	onCleanup(() => {
		if (!lastScrollElement) return
		lastScrollElement.classList.remove(NATIVE_SCROLLBAR_HIDE_CLASS)
	})

	const handlePointerDown = (event: PointerEvent) => {
		event.preventDefault()

		const element = getScrollElementOrWarn('pointer-down')
		if (!element || !containerRef) return

		const rect = containerRef.getBoundingClientRect()
		const localY = Math.max(
			0,
			Math.min(scrollState.containerHeight, event.clientY - rect.top)
		)
		const isOnThumb =
			localY >= thumbTop() && localY <= thumbTop() + thumbHeight()

		if (isOnThumb) {
			dragState = {
				pointerId: event.pointerId,
				dragOffsetY: localY - thumbTop(),
				thumbHeight: thumbHeight(),
			}
			containerRef.setPointerCapture(event.pointerId)
			setIsDragging(true)
		} else {
			// Click on track - jump to that position
			const containerHeight = scrollState.containerHeight
			const centerY = localY - thumbHeight() / 2
			const maxThumbTop = Math.max(0, containerHeight - thumbHeight())
			const ratio = maxThumbTop > 0 ? centerY / maxThumbTop : 0

			const scrollHeight = element.scrollHeight
			const clientHeight = element.clientHeight
			const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

			element.scrollTop = Math.max(
				0,
				Math.min(maxScrollTop, ratio * maxScrollTop)
			)
		}
	}

	const handlePointerMove = (event: PointerEvent) => {
		if (!dragState || event.pointerId !== dragState.pointerId) return

		const element = getScrollElementOrWarn('pointer-move')
		if (!element || !containerRef) return

		const rect = containerRef.getBoundingClientRect()
		const containerHeight = scrollState.containerHeight

		const localY = Math.max(
			0,
			Math.min(containerHeight, event.clientY - rect.top)
		)
		const newThumbTop = localY - dragState.dragOffsetY

		const maxThumbTop = Math.max(0, containerHeight - dragState.thumbHeight)
		const ratio = maxThumbTop > 0 ? newThumbTop / maxThumbTop : 0

		const scrollHeight = element.scrollHeight
		const clientHeight = element.clientHeight
		const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

		element.scrollTop = Math.max(
			0,
			Math.min(maxScrollTop, ratio * maxScrollTop)
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
		const element = getScrollElementOrWarn('wheel')
		if (element) {
			element.scrollTop += event.deltaY
		}
	}

	return (
		<div
			ref={containerRef}
			class={clsx('scrollbar-container', props.class)}
			style={{
				width: `${props.width ?? SCROLLBAR_WIDTH}px`,
				height: '100%',
				position: 'relative',
				'flex-shrink': 0,
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
					left: '2px',
					right: '2px',
					top: `${thumbTop()}px`,
					height: `${thumbHeight()}px`,
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
