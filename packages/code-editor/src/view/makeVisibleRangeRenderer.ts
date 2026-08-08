/**
 * makeVisibleRangeRenderer — bounded visible-range renderer with overscan.
 *
 * Coordinates TextLayer, GutterLayer, and OverlayLayer to render
 * only the lines visible in the viewport plus overscan rows.
 *
 * Not a Solid component. All DOM updates are imperative.
 */

import type { EditorCore, EditorDirtyState } from '../core/types'
import type { EditorMetrics, VisibleRange } from './domMetrics'
import { computeVisibleRange, computePoolSize } from './domMetrics'
import {
	type TextLayerState,
	createTextLayer,
	updateTextLayer,
	destroyTextLayer,
	type TextLayerUpdateResult,
} from './TextLayer'
import {
	type GutterLayerState,
	createGutterLayer,
	updateGutterLayer,
	destroyGutterLayer,
} from './GutterLayer'
import {
	type OverlayLayerState,
	createOverlayLayer,
	updateCursor,
	updateSelection,
	destroyOverlayLayer,
} from './OverlayLayer'
import type { LineRenderInput } from './lineHtml'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VisibleRangeRendererConfig = {
	core: EditorCore
	metrics: EditorMetrics
	/** Container where the content (gutter + text + overlay) is rendered. */
	contentContainer: HTMLElement
	/** Optional decoration lookup by line ID. */
	getLineDecorations?: (lineId: number) => {
		highlights: LineRenderInput['highlights']
		bracketDepths: LineRenderInput['bracketDepths']
	}
}

export type FlushResult = {
	rowsUpdated: number
	overlayUpdated: boolean
	gutterUpdated: boolean
}

export type VisibleRangeRenderer = {
	/**
	 * Flush dirty state to the DOM. Returns what was updated.
	 */
	flush(dirty: EditorDirtyState, themeVersion: number, decorationRevision: number): FlushResult
	/** Get the current visible range. */
	getVisibleRange(): VisibleRange
	/** Get the gutter width. */
	getGutterWidth(): number
	/** Force a full repaint (e.g., after theme change). */
	invalidateAll(): void
	/** Update metrics (after font measurement). */
	setMetrics(metrics: EditorMetrics): void
	/** Tear down. */
	destroy(): void
}

export const makeVisibleRangeRenderer = (
	config: VisibleRangeRendererConfig
): VisibleRangeRenderer => {
	const { core, contentContainer, getLineDecorations } = config
	let metrics = config.metrics

	const textLayer: TextLayerState = createTextLayer(contentContainer)
	const gutterLayer: GutterLayerState = createGutterLayer(contentContainer)
	const overlayLayer: OverlayLayerState = createOverlayLayer(contentContainer)

	let lastVisibleRange: VisibleRange = { startLine: 0, endLine: 0 }
	let invalidated = true

	const computeRange = (): VisibleRange => {
		const viewport = core.getViewport()
		return computeVisibleRange(
			viewport.scrollTop,
			viewport.viewportHeight,
			metrics.lineHeight,
			core.getLineCount(),
			metrics.overscanLines
		)
	}

	const getActiveLine = (): number => {
		const selections = core.getSelections()
		if (selections.length === 0) return 0
		const offset = selections[0]!.focus
		const snapshot = core.getSnapshot()
		const lineStarts = snapshot.document.lineStarts
		let line = 0
		for (let i = 0; i < lineStarts.length; i++) {
			if (lineStarts[i]! <= offset) line = i
			else break
		}
		return line
	}

	return {
		flush(
			dirty: EditorDirtyState,
			themeVersion: number,
			decorationRevision: number
		): FlushResult {
			const range = computeRange()
			lastVisibleRange = range

			let rowsUpdated = 0
			let overlayUpdated = false
			let gutterUpdated = false

			// Update content spacer to set scroll height
			const totalHeight = core.getLineCount() * metrics.lineHeight
			contentContainer.style.height = `${totalHeight}px`

			// Text layer update if text/decorations/fullMeasure dirty, range changed, or invalidated
			if (dirty.text || dirty.fullMeasure || invalidated ||
				dirty.lineRange || dirty.decorationLineIds) {
				const result = updateTextLayer(
					textLayer,
					core,
					range.startLine,
					range.endLine,
					metrics,
					themeVersion,
					decorationRevision,
					getLineDecorations
				)
				rowsUpdated = result.rowsUpdated
			}

			// Gutter update
			if (dirty.gutter || dirty.text || dirty.fullMeasure || invalidated) {
				const result = updateGutterLayer(
					gutterLayer,
					range.startLine,
					range.endLine,
					getActiveLine(),
					core.getLineCount(),
					metrics
				)
				gutterUpdated = result.gutterUpdated
			}

			// Overlay update
			if (dirty.overlay || dirty.text || invalidated) {
				updateCursor(overlayLayer, core, metrics, gutterLayer.gutterWidth)
				const hadSelection = updateSelection(
					overlayLayer,
					core,
					metrics,
					gutterLayer.gutterWidth,
					range.startLine,
					range.endLine
				)
				overlayUpdated = true
			}

			// Offset text layer by gutter width
			textLayer.container.style.left = `${gutterLayer.gutterWidth}px`
			overlayLayer.container.style.left = '0'

			invalidated = false

			return { rowsUpdated, overlayUpdated, gutterUpdated }
		},

		getVisibleRange() {
			return lastVisibleRange
		},

		getGutterWidth() {
			return gutterLayer.gutterWidth
		},

		invalidateAll() {
			invalidated = true
			// Clear all cache keys so every row rerenders
			for (const row of textLayer.rows) {
				row.cacheKey = null
			}
		},

		setMetrics(newMetrics: EditorMetrics) {
			metrics = newMetrics
			invalidated = true
		},

		destroy() {
			destroyTextLayer(textLayer)
			destroyGutterLayer(gutterLayer)
			destroyOverlayLayer(overlayLayer)
		},
	}
}
