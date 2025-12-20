/**
 * Minimap Renderer Worker
 *
 * Renders the minimap base layer to an OffscreenCanvas.
 * Uses Comlink for clean RPC-style communication.
 * Can communicate directly with Tree-sitter worker for token summaries.
 *
 * Implements VS Code-style character rendering with:
 * - Prebaked atlas data for scales 1 and 2
 * - Brightness normalization in downsampling
 * - True background color blending
 * - Partial repainting (only changed lines)
 * - Light/Normal font variants for theme support
 */

import { expose, proxy, wrap, type Remote } from 'comlink'
import { loggers } from '@repo/logger'
import { MINIMAP_DEFAULT_PALETTE } from '../tokenSummary'
import type {
	MinimapTokenSummary,
	MinimapLayout,
	TreeSitterMinimapApi,
} from './types'
import { Constants } from './constants'
import { setLightFont as setLightFontAtlas } from './fontAtlas'
import { resetPartialRepaintState, invalidateCache } from './partialRepaint'
import {
	renderFromSummary,
	incrementRenderNonce,
	getCurrentNonce,
	waitForMinimapReady,
	wakeWaiters,
	clearWaiters,
} from './rendering'

const log = loggers.codeEditor.withTag('minimap')

// ============================================================================
// Worker State
// ============================================================================

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let layout: MinimapLayout | null = null
let palette: Uint32Array = MINIMAP_DEFAULT_PALETTE

// Scroll state
let scrollY = 0
let lastSummary: MinimapTokenSummary | null = null

// Tree-sitter worker proxy for direct communication
let treeSitterWorker: Remote<TreeSitterMinimapApi> | null = null
let minimapSubscriptionId: number | null = null

// ============================================================================
// Worker API
// ============================================================================
const api = {
	/**
	 * Initialize with OffscreenCanvas and layout
	 */
	init(
		offscreen: OffscreenCanvas,
		newLayout: MinimapLayout,
		newPalette?: Uint32Array
	) {
		canvas = offscreen
		layout = newLayout
		if (newPalette) {
			palette = newPalette
		}

		canvas.width = layout.size.deviceWidth
		canvas.height = layout.size.deviceHeight

		ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
		if (!ctx) {
			throw new Error('Failed to get 2D context from OffscreenCanvas')
		}

		// Reset partial repaint state
		resetPartialRepaintState()
	},

	/**
	 * Connect to Tree-sitter worker for direct communication
	 */
	async connectTreeSitter(port: MessagePort) {
		try {
			log.info('connectTreeSitter called')
			treeSitterWorker = wrap<TreeSitterMinimapApi>(port)
			log.info('wrapped port with Comlink')

			if (minimapSubscriptionId !== null) {
				log.info('unsubscribing previous subscription')
				void treeSitterWorker.unsubscribeMinimapReady(minimapSubscriptionId)
				minimapSubscriptionId = null
			}

			log.info('subscribing to minimapReady...')
			minimapSubscriptionId = await treeSitterWorker.subscribeMinimapReady(
				proxy(({ path }) => {
					log.info('minimapReady notification for', path)
					wakeWaiters(path)
				})
			)
			log.info('subscribeMinimapReady completed, id:', minimapSubscriptionId)
		} catch (error) {
			log.error('connectTreeSitter FAILED:', error)
			throw error
		}
	},

	/**
	 * Update layout
	 */
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

	/**
	 * Update scroll position
	 */
	updateScroll(scrollTop: number) {
		if (scrollY === scrollTop) return

		scrollY = scrollTop

		if (lastSummary && ctx && layout) {
			renderFromSummary(lastSummary, ctx, layout, palette, scrollY)
		}
	},

	/**
	 * Update color palette
	 */
	updatePalette(newPalette: Uint32Array) {
		palette = newPalette
		invalidateCache() // Force full repaint on palette change
	},

	/**
	 * Set font variant (light for light themes, normal for dark themes)
	 */
	setLightFont(isLight: boolean) {
		if (setLightFontAtlas(isLight)) {
			invalidateCache() // Force full repaint on variant change
		}
	},

	/**
	 * Render from token summary (binary format)
	 */
	renderSummary(summary: MinimapTokenSummary) {
		if (!ctx || !layout) {
			log.warn('Missing context/layout')
			return
		}
		lastSummary = summary
		renderFromSummary(summary, ctx, layout, palette, scrollY)
	},

	/**
	 * Request summary from Tree-sitter and render
	 */
	async renderFromPath(path: string, version: number) {
		const nonce = incrementRenderNonce()
		if (!treeSitterWorker) {
			log.warn('Tree-sitter worker not connected')
			return false
		}

		// Try twice - once immediately, once after waiting for tree-sitter to be ready
		for (let attempt = 0; attempt < 2; attempt++) {
			if (nonce !== getCurrentNonce()) return false

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
			} catch (err) {
				log.error('getMinimapSummary failed:', err)
				return false
			}

			if (nonce !== getCurrentNonce()) return false

			if (summary) {
				if (!ctx || !layout) {
					log.warn('Missing context/layout')
					return false
				}
				lastSummary = summary
				renderFromSummary(summary, ctx, layout, palette, scrollY)
				return true
			}

			// Clear canvas while waiting
			api.clear()

			// Wait for tree-sitter to notify that the file is ready
			const becameReady = await Promise.race([
				waitForMinimapReady(path, nonce),
				new Promise<boolean>((resolve) =>
					setTimeout(() => resolve(false), 2000)
				),
			])
			if (!becameReady) return false
		}

		return false
	},

	/**
	 * Render minimap from plain text (fallback for unsupported languages)
	 */
	async renderFromText(text: string, version: number) {
		if (!treeSitterWorker) {
			log.warn('Tree-sitter worker not connected')
			return false
		}

		const activeLayout = layout
		if (!activeLayout || !ctx) {
			log.warn('Missing context/layout')
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
				renderFromSummary(summary, ctx, activeLayout, palette, scrollY)
				return true
			}
		} catch (err) {
			log.error('getMinimapSummaryFromText failed:', err)
		}

		return false
	},

	/**
	 * Clear the canvas
	 */
	clear() {
		if (!ctx || !canvas || !layout) return
		ctx.clearRect(0, 0, layout.size.deviceWidth, layout.size.deviceHeight)
		resetPartialRepaintState()
	},

	/**
	 * Dispose and cleanup
	 */
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
