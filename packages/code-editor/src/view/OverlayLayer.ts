/**
 * OverlayLayer — imperative DOM layer for cursor, selection, and markers.
 *
 * Owns:
 * - primary cursor (beam/block variants)
 * - selection rectangles
 *
 * Overlay repaint is independent from text repaint when possible.
 */

import type { EditorCore, SelectionRange } from '../core/types'
import { type EditorMetrics, columnToX } from './domMetrics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverlayLayerState = {
	container: HTMLElement
	cursorEl: HTMLElement
	selectionEls: HTMLElement[]
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createOverlayLayer = (parent: HTMLElement): OverlayLayerState => {
	const container = document.createElement('div')
	container.className = 'editor-overlay-layer'
	container.style.position = 'absolute'
	container.style.left = '0'
	container.style.right = '0'
	container.style.top = '0'
	container.style.bottom = '0'
	container.style.pointerEvents = 'none'
	parent.appendChild(container)

	const cursorEl = document.createElement('div')
	cursorEl.className = 'editor-cursor'
	cursorEl.style.position = 'absolute'
	cursorEl.style.display = 'none'
	container.appendChild(cursorEl)

	return { container, cursorEl, selectionEls: [] }
}

// ---------------------------------------------------------------------------
// Update cursor
// ---------------------------------------------------------------------------

export const updateCursor = (
	state: OverlayLayerState,
	core: EditorCore,
	metrics: EditorMetrics,
	gutterWidth: number
): void => {
	const selections = core.getSelections()
	if (selections.length === 0) {
		state.cursorEl.style.display = 'none'
		return
	}

	const sel = selections[0]!
	const snapshot = core.getSnapshot()
	const lineStarts = snapshot.document.lineStarts
	const cursorOffset = sel.focus

	// Find the line the cursor is on
	let lineIndex = 0
	for (let i = 0; i < lineStarts.length; i++) {
		if (lineStarts[i]! <= cursorOffset) lineIndex = i
		else break
	}

	const lineStart = lineStarts[lineIndex]!
	const column = cursorOffset - lineStart
	const lineText = core.getLineText(lineIndex)
	const x = columnToX(lineText, column, metrics) + gutterWidth
	const y = lineIndex * metrics.lineHeight

	state.cursorEl.style.transform = `translate(${x}px, ${y}px)`
	state.cursorEl.style.width = '2px'
	state.cursorEl.style.height = `${metrics.lineHeight}px`
	state.cursorEl.style.display = ''
}

// ---------------------------------------------------------------------------
// Update selection highlights
// ---------------------------------------------------------------------------

export const updateSelection = (
	state: OverlayLayerState,
	core: EditorCore,
	metrics: EditorMetrics,
	gutterWidth: number,
	viewportStartLine: number,
	viewportEndLine: number
): boolean => {
	const selections = core.getSelections()
	if (selections.length === 0 || (selections[0]!.anchor === selections[0]!.focus)) {
		// Clear selection rects
		for (const el of state.selectionEls) {
			el.style.display = 'none'
		}
		return false
	}

	const sel = selections[0]!
	const start = Math.min(sel.anchor, sel.focus)
	const end = Math.max(sel.anchor, sel.focus)

	const snapshot = core.getSnapshot()
	const lineStarts = snapshot.document.lineStarts
	const lineCount = lineStarts.length

	// Find start and end lines
	let startLine = 0
	let endLine = 0
	for (let i = 0; i < lineCount; i++) {
		if (lineStarts[i]! <= start) startLine = i
		if (lineStarts[i]! <= end) endLine = i
	}

	// Clip to viewport. A selection entirely outside the visible range gives
	// lastLine < firstLine; without the clamp the count goes negative, the
	// hide-excess loop below starts at a negative index, and dereferencing that
	// throws inside the frame flush — which stops the editor repainting at all.
	const firstLine = Math.max(startLine, viewportStartLine)
	const lastLine = Math.min(endLine, viewportEndLine - 1)
	const rectCount = Math.max(0, lastLine - firstLine + 1)

	// Ensure we have enough selection elements
	while (state.selectionEls.length < rectCount) {
		const el = document.createElement('div')
		el.className = 'editor-selection'
		el.style.position = 'absolute'
		el.style.display = 'none'
		state.container.insertBefore(el, state.cursorEl)
		state.selectionEls.push(el)
	}

	for (let i = 0; i < rectCount; i++) {
		const lineIndex = firstLine + i
		const lineStart = lineStarts[lineIndex]!
		const lineText = core.getLineText(lineIndex)
		const lineEnd = lineStart + lineText.length

		const selStart = lineIndex === startLine ? start - lineStart : 0
		const selEnd = lineIndex === endLine ? end - lineStart : lineText.length

		const x1 = columnToX(lineText, selStart, metrics) + gutterWidth
		const x2 = columnToX(lineText, selEnd, metrics) + gutterWidth
		const y = lineIndex * metrics.lineHeight

		const el = state.selectionEls[i]!
		el.style.transform = `translate(${x1}px, ${y}px)`
		el.style.width = `${Math.max(x2 - x1, metrics.charWidth / 4)}px`
		el.style.height = `${metrics.lineHeight}px`
		el.style.display = ''
	}

	// Hide excess selection elements
	for (let i = rectCount; i < state.selectionEls.length; i++) {
		state.selectionEls[i]!.style.display = 'none'
	}

	return true
}

// ---------------------------------------------------------------------------
// Destroy
// ---------------------------------------------------------------------------

export const destroyOverlayLayer = (state: OverlayLayerState): void => {
	state.container.remove()
	state.selectionEls.length = 0
}
