import { expose, proxy, wrap, type Remote } from 'comlink'
import { MINIMAP_DEFAULT_PALETTE } from '../tokenSummary'
import type {
	MinimapTokenSummary,
	MinimapLayout,
	TreeSitterMinimapApi,
} from './types'
import { Constants } from './constants'
import { setDark as setDarkAtlas } from './fontAtlas'
import { resetPartialRepaintState, invalidateCache } from './partialRepaint'
import {
	renderFromSummary,
	incrementRenderNonce,
	getCurrentNonce,
	wakeWaiters,
	clearWaiters,
} from './rendering'

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let layout: MinimapLayout | null = null
let palette: Uint32Array = MINIMAP_DEFAULT_PALETTE

let bgR = 24
let bgG = 24
let bgB = 27

const updateBgFromPacked = (packed: number) => {
	bgR = packed & 0xff
	bgG = (packed >> 8) & 0xff
	bgB = (packed >> 16) & 0xff
}
let scrollY = 0
let lastSummary: MinimapTokenSummary | null = null

let treeSitterWorker: Remote<TreeSitterMinimapApi> | null = null
let minimapSubscriptionId: number | null = null

const summaryCache = new Map<
	string,
	{ summary: MinimapTokenSummary; scrollY: number }
>()
let currentPath: string | null = null

const api = {
	init(
		offscreen: OffscreenCanvas,
		newLayout: MinimapLayout,
		newPalette?: Uint32Array,
		bgColor?: number
	) {
		canvas = offscreen
		layout = newLayout
		if (newPalette) {
			palette = newPalette
		}
		if (bgColor !== undefined) {
			updateBgFromPacked(bgColor)
		}

		canvas.width = layout.size.deviceWidth
		canvas.height = layout.size.deviceHeight

		ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
		if (!ctx) {
			throw new Error('Failed to get 2D context from OffscreenCanvas')
		}

		resetPartialRepaintState()
	},

	async connectTreeSitter(port: MessagePort) {
		treeSitterWorker = wrap<TreeSitterMinimapApi>(port)

		if (minimapSubscriptionId !== null) {
			void treeSitterWorker.unsubscribeMinimapReady(minimapSubscriptionId)
			minimapSubscriptionId = null
		}

		minimapSubscriptionId = await treeSitterWorker.subscribeMinimapReady(
			proxy(({ path }) => {
				wakeWaiters(path)
			})
		)
	},

	updateLayout(newLayout: MinimapLayout) {
		layout = newLayout
		if (canvas) {
			if (canvas.width !== layout.size.deviceWidth) {
				canvas.width = layout.size.deviceWidth
				invalidateCache()
			}
			if (canvas.height !== layout.size.deviceHeight) {
				canvas.height = layout.size.deviceHeight
				invalidateCache()
			}
		}
	},

	updateScroll(scrollTop: number) {
		if (scrollY === scrollTop) return

		scrollY = scrollTop

		if (lastSummary && ctx && layout) {
			renderFromSummary(
				lastSummary,
				ctx,
				layout,
				palette,
				scrollY,
				bgR,
				bgG,
				bgB
			)
		}
	},

	updatePalette(newPalette: Uint32Array, bgColor?: number) {
		palette = newPalette
		if (bgColor !== undefined) {
			updateBgFromPacked(bgColor)
		}
		invalidateCache() // Force full repaint on palette change

		if (lastSummary && ctx && layout) {
			renderFromSummary(
				lastSummary,
				ctx,
				layout,
				palette,
				scrollY,
				bgR,
				bgG,
				bgB,
				true
			)
		}
	},

	setDark(isDark: boolean) {
		if (setDarkAtlas(isDark)) {
			invalidateCache() // Force full repaint on variant change
		}
	},

	renderSummary(summary: MinimapTokenSummary) {
		if (!ctx || !layout) {
			return
		}
		lastSummary = summary
		renderFromSummary(summary, ctx, layout, palette, scrollY, bgR, bgG, bgB)
	},

	async renderFromPath(path: string, version: number) {
		const nonce = incrementRenderNonce()
		if (!treeSitterWorker) {
			return false
		}

		if (nonce !== getCurrentNonce()) return false

		const isNewPath = currentPath !== path
		if (isNewPath) {
			if (currentPath && lastSummary) {
				summaryCache.set(currentPath, { summary: lastSummary, scrollY })
			}
			currentPath = path

			const cached = summaryCache.get(path)
			if (cached && ctx && layout) {
				lastSummary = cached.summary
				scrollY = cached.scrollY
				renderFromSummary(
					cached.summary,
					ctx,
					layout,
					palette,
					scrollY,
					bgR,
					bgG,
					bgB
				)
			}
		}

		let summary: MinimapTokenSummary | undefined
		try {
			const activeLayout = layout
			if (!activeLayout) return false

			const scale = Math.round(activeLayout.size.dpr)
			const rowHeightDevice = Constants.BASE_CHAR_HEIGHT * scale
			const targetLineCount = Math.max(
				1,
				Math.floor(activeLayout.size.deviceHeight / rowHeightDevice)
			)

			summary = await treeSitterWorker.getMinimapSummary({
				path,
				version,
				maxChars: activeLayout.maxChars,
				targetLineCount,
			})
		} catch {
			return false
		}

		if (nonce !== getCurrentNonce()) return false

		if (summary) {
			if (!ctx || !layout) {
				return false
			}
			lastSummary = summary
			renderFromSummary(summary, ctx, layout, palette, scrollY, bgR, bgG, bgB)
			return true
		}

		return false
	},

	async renderFromText(text: string, version: number) {
		if (!treeSitterWorker) {
			return false
		}

		const activeLayout = layout
		if (!activeLayout || !ctx) {
			return false
		}

		try {
			const summary = await treeSitterWorker.getMinimapSummaryFromText({
				text,
				version,
				maxChars: activeLayout.maxChars,
			})

			if (summary) {
				lastSummary = summary
				renderFromSummary(
					summary,
					ctx,
					activeLayout,
					palette,
					scrollY,
					bgR,
					bgG,
					bgB
				)
				return true
			}
		} catch {
			// Ignore errors
		}

		return false
	},

	clear() {
		if (!ctx || !canvas || !layout) return
		ctx.clearRect(0, 0, layout.size.deviceWidth, layout.size.deviceHeight)
		resetPartialRepaintState()
	},

	dispose() {
		canvas = null
		ctx = null
		layout = null
		if (treeSitterWorker && minimapSubscriptionId !== null) {
			void treeSitterWorker.unsubscribeMinimapReady(minimapSubscriptionId)
		}
		treeSitterWorker = null
		minimapSubscriptionId = null
		clearWaiters()
		resetPartialRepaintState()
	},
}

export type MinimapWorkerApi = typeof api

expose(api)
