/**
 * TextLayer — imperative DOM layer for visible text rows.
 *
 * Manages a pool of row elements sized to the visible range + overscan.
 * Each row is keyed by line identity and rendered via lineHtml cache.
 * No Solid reactivity in the hot path.
 */

import type { EditorCore } from '../core/types'
import type { EditorMetrics } from './domMetrics'
import {
	type LineRenderInput,
	type RowCacheKey,
	renderLine,
} from './lineHtml'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RowElement = {
	element: HTMLElement
	lineId: number | null
	cacheKey: RowCacheKey | null
}

export type TextLayerState = {
	container: HTMLElement
	rows: RowElement[]
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createTextLayer = (parent: HTMLElement): TextLayerState => {
	const container = document.createElement('div')
	container.className = 'editor-text-layer'
	container.style.position = 'absolute'
	container.style.left = '0'
	container.style.right = '0'
	container.style.top = '0'
	container.style.pointerEvents = 'none'
	parent.appendChild(container)

	return { container, rows: [] }
}

// ---------------------------------------------------------------------------
// Ensure pool size
// ---------------------------------------------------------------------------

const ensurePoolSize = (state: TextLayerState, poolSize: number): void => {
	while (state.rows.length < poolSize) {
		const el = document.createElement('div')
		el.className = 'editor-text-row'
		el.style.position = 'absolute'
		el.style.left = '0'
		el.style.right = '0'
		el.style.whiteSpace = 'pre'
		el.style.display = 'none'
		state.container.appendChild(el)
		state.rows.push({ element: el, lineId: null, cacheKey: null })
	}

	// Hide excess rows
	for (let i = poolSize; i < state.rows.length; i++) {
		state.rows[i]!.element.style.display = 'none'
		state.rows[i]!.lineId = null
	}
}

// ---------------------------------------------------------------------------
// Update visible range
// ---------------------------------------------------------------------------

export type TextLayerUpdateResult = {
	rowsUpdated: number
}

/**
 * Update the text layer to render lines in [startLine, endLine).
 *
 * Returns the number of rows that were actually re-rendered.
 */
export const updateTextLayer = (
	state: TextLayerState,
	core: EditorCore,
	startLine: number,
	endLine: number,
	metrics: EditorMetrics,
	themeVersion: number,
	decorationRevision: number,
	getLineDecorations?: (lineId: number) => { highlights: LineRenderInput['highlights']; bracketDepths: LineRenderInput['bracketDepths'] }
): TextLayerUpdateResult => {
	const lineCount = endLine - startLine
	ensurePoolSize(state, lineCount)

	let rowsUpdated = 0

	for (let i = 0; i < lineCount; i++) {
		const lineIndex = startLine + i
		const row = state.rows[i]!
		const lineId = core.getLineId(lineIndex)
		const lineRevision = core.getLineRevision(lineId)
		const lineText = core.getLineText(lineIndex)

		const decorations = getLineDecorations?.(lineId)

		const input: LineRenderInput = {
			lineId,
			lineRevision,
			decorationRevision,
			themeVersion,
			text: lineText,
			highlights: decorations?.highlights ?? null,
			bracketDepths: decorations?.bracketDepths ?? null,
		}

		const newKey = renderLine(row.element, input, row.cacheKey)
		if (newKey) {
			row.cacheKey = newKey
			rowsUpdated++
		}
		row.lineId = lineId

		// Position the row
		const y = lineIndex * metrics.lineHeight
		row.element.style.transform = `translateY(${y}px)`
		row.element.style.height = `${metrics.lineHeight}px`
		row.element.style.display = ''
	}

	// Hide unused rows
	for (let i = lineCount; i < state.rows.length; i++) {
		state.rows[i]!.element.style.display = 'none'
		state.rows[i]!.lineId = null
	}

	return { rowsUpdated }
}

// ---------------------------------------------------------------------------
// Destroy
// ---------------------------------------------------------------------------

export const destroyTextLayer = (state: TextLayerState): void => {
	state.container.remove()
	state.rows.length = 0
}
