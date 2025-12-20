/**
 * Shared Scroll State
 *
 * Single source of truth for scroll position.
 * Used by Editor, Minimap, and Scrollbar for synchronized scroll rendering.
 */

import {
	createContext,
	onCleanup,
	useContext,
	type ParentComponent,
} from 'solid-js'
import { createStore, type SetStoreFunction } from 'solid-js/store'
import { MINIMAP_ROW_HEIGHT_CSS } from './constants'
import { getMinimapScrollState, type MinimapScrollState } from './scrollUtils'

export type ScrollStateStore = MinimapScrollState & {
	/** Current scroll ratio (0-1) */
	scrollRatio: number
	/** Total line count */
	lineCount: number
	/** Container height (CSS pixels) */
	containerHeight: number
}

type ScrollContextValue = {
	/** Current scroll state (reactive store) */
	scrollState: ScrollStateStore
	/** Store setter for direct updates */
	setScrollState: SetStoreFunction<ScrollStateStore>
	/** Set the scroll element to listen to */
	setScrollElement: (element: HTMLElement | null) => void
	/** Set line count for calculations */
	setLineCount: (count: number) => void
	/** Set container height for calculations */
	setContainerHeight: (height: number) => void
	/** Current scroll element */
	getScrollElement: () => HTMLElement | null
}

const ScrollContext = createContext<ScrollContextValue>()

const defaultScrollState: ScrollStateStore = {
	minimapScrollTop: 0,
	sliderTop: 0,
	sliderHeight: 20,
	scrollRatio: 0,
	lineCount: 0,
	containerHeight: 0,
}

export const ScrollStateProvider: ParentComponent = (props) => {
	const [scrollState, setScrollState] =
		createStore<ScrollStateStore>(defaultScrollState)

	let scrollElement: HTMLElement | null = null
	let scrollHandler: (() => void) | null = null

	// Update scroll state from current values
	const updateScrollState = () => {
		if (!scrollElement) {
			setScrollState(defaultScrollState)
			return
		}

		const lines = scrollState.lineCount
		const height = scrollState.containerHeight
		const totalMinimapHeight = lines * MINIMAP_ROW_HEIGHT_CSS

		const state = getMinimapScrollState(
			scrollElement,
			height,
			totalMinimapHeight
		)

		// Calculate scroll ratio
		const scrollHeight = scrollElement.scrollHeight
		const clientHeight = scrollElement.clientHeight
		const overscrollPadding = clientHeight * 0.5
		const actualContentHeight = scrollHeight - overscrollPadding
		const maxActualScroll = Math.max(0, actualContentHeight - clientHeight)
		const scrollRatio =
			maxActualScroll > 0
				? Math.min(1, Math.max(0, scrollElement.scrollTop / maxActualScroll))
				: 0

		setScrollState({
			minimapScrollTop: state.minimapScrollTop,
			sliderTop: state.sliderTop,
			sliderHeight: state.sliderHeight,
			scrollRatio,
		})
	}

	const setScrollElement = (element: HTMLElement | null) => {
		if (scrollElement && scrollHandler) {
			scrollElement.removeEventListener('scroll', scrollHandler)
		}

		scrollElement = element

		if (element) {
			scrollHandler = () => updateScrollState()
			element.addEventListener('scroll', scrollHandler, { passive: true })
			// Initial update
			updateScrollState()
		}
	}

	const setLineCount = (count: number) => {
		setScrollState('lineCount', count)
		updateScrollState()
	}

	const setContainerHeight = (height: number) => {
		setScrollState('containerHeight', height)
		updateScrollState()
	}

	const getScrollElement = () => scrollElement

	onCleanup(() => {
		if (scrollElement && scrollHandler) {
			scrollElement.removeEventListener('scroll', scrollHandler)
		}
	})

	return (
		<ScrollContext.Provider
			value={{
				scrollState,
				setScrollState,
				setScrollElement,
				setLineCount,
				setContainerHeight,
				getScrollElement,
			}}
		>
			{props.children}
		</ScrollContext.Provider>
	)
}

export const useScrollState = () => {
	const context = useContext(ScrollContext)
	if (!context) {
		throw new Error('useScrollState must be used within ScrollStateProvider')
	}
	return context
}
