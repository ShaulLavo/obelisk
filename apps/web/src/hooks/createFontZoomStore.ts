import { makePersisted } from '@solid-primitives/storage'
import { createStore } from 'solid-js/store'

export type FontModule = 'ui' | 'editor' | 'terminal'

export type FontZoomState = {
	ui: number
	editor: number
	terminal: number
}

export type FontZoomActions = {
	zoomIn: (module: FontModule) => void
	zoomOut: (module: FontModule) => void
	resetZoom: (module: FontModule) => void
	setZoom: (module: FontModule, offset: number) => void
}

export type FontZoomStore = {
	state: FontZoomState
	actions: FontZoomActions
	getZoomOffset: (module: FontModule) => number
}

const _MIN_FONT_SIZE = 6
const _MAX_FONT_SIZE = 48
const ZOOM_STEP = 1

let globalFontZoomStore: FontZoomStore | undefined

export const createFontZoomStore = (): FontZoomStore => {
	if (globalFontZoomStore) {
		return globalFontZoomStore
	}

	/* eslint-disable solid/reactivity -- store created once at module level, not in a component */
	const [state, setState] = makePersisted(
		createStore<FontZoomState>({
			ui: 0,
			editor: 0,
			terminal: 0,
		}),
		{
			name: 'font-zoom-offsets',
		}
	)
	/* eslint-enable solid/reactivity */

	const zoomIn = (module: FontModule) => {
		setState(module, (current) => current + ZOOM_STEP)
	}

	const zoomOut = (module: FontModule) => {
		setState(module, (current) => current - ZOOM_STEP)
	}

	const resetZoom = (module: FontModule) => {
		setState(module, 0)
	}

	const setZoom = (module: FontModule, offset: number) => {
		setState(module, offset)
	}

	const getZoomOffset = (module: FontModule) => {
		return state[module]
	}

	const actions: FontZoomActions = {
		zoomIn,
		zoomOut,
		resetZoom,
		setZoom,
	}

	globalFontZoomStore = {
		state,
		actions,
		getZoomOffset,
	}

	return globalFontZoomStore
}
