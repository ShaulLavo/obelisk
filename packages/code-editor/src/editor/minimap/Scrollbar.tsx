import { clsx } from 'clsx'
import type { JSX } from 'solid-js'
import { useScrollState } from './ScrollState'
import { useTheme } from '@repo/theme'
import { Scrollbar as UiScrollbar } from '@repo/ui/Scrollbar'

export type ScrollbarProps = {
	width?: number
	class?: string
	style?: JSX.CSSProperties
}

const SCROLLBAR_WIDTH = 14
const SCROLLBAR_MIN_THUMB_HEIGHT = 20

export const Scrollbar = (props: ScrollbarProps) => {
	const { scrollState, scrollElement } = useScrollState()
	const { theme } = useTheme()

	// Read from shared store
	const thumbTop = () => scrollState.sliderTop
	const thumbHeight = () =>
		Math.max(SCROLLBAR_MIN_THUMB_HEIGHT, scrollState.sliderHeight)

	const getScrollElementOrWarn = () => {
		const element = scrollElement()
		if (!element) {
			return null
		}
		return element
	}

	const scrollToRatio = (ratio: number) => {
		const element = getScrollElementOrWarn()
		if (!element) return

		const scrollHeight = element.scrollHeight
		const clientHeight = element.clientHeight
		const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
		const next = Math.max(0, Math.min(1, ratio)) * maxScrollTop

		element.scrollTop = next
	}

	const scrollBy = (delta: number) => {
		const element = getScrollElementOrWarn()
		if (!element) return

		element.scrollTop += delta
	}

	const resolveThumbStyle = (state: {
		isHovered: boolean
		isDragging: boolean
	}) => ({
		'background-color':
			theme.editor.scrollbarThumb ??
			(state.isDragging
				? 'rgba(255, 255, 255, 0.3)'
				: state.isHovered
					? 'rgba(255, 255, 255, 0.12)'
					: 'rgba(255, 255, 255, 0.08)'),
		opacity: state.isDragging ? 0.8 : state.isHovered ? 0.6 : 0.4,
		'border-radius': '0px',
		transition: state.isDragging ? 'none' : 'background-color 0.15s ease',
		'backdrop-filter': 'blur(4px)',
	})

	return (
		<UiScrollbar
			class={clsx('scrollbar-container', props.class)}
			style={{
				height: '100%',
				...props.style,
			}}
			size={props.width ?? SCROLLBAR_WIDTH}
			thumbOffset={thumbTop}
			thumbSize={thumbHeight}
			onScrollTo={scrollToRatio}
			onScrollBy={scrollBy}
			thumbStyle={resolveThumbStyle}
		/>
	)
}
