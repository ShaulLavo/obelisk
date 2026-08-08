/**
 * domMetrics — tab-aware monospace measurement API.
 *
 * v1 geometry invariant: monospace-only.
 * A single measured advance width is assumed for non-tab glyph layout.
 * Tabs expand to tab stops using the current tabSize.
 *
 * All geometry consumers (input, overlay, selection, gutter, layout)
 * must use this one measurement API — no subsystem-local geometry helpers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorMetrics = {
	/** Width of a single monospace character in pixels. */
	charWidth: number
	/** Line height in pixels. */
	lineHeight: number
	/** Tab size in characters. */
	tabSize: number
	/** Number of lines to add as vertical overscan above and below viewport. */
	overscanLines: number
}

export type CaretRect = {
	x: number
	y: number
	width: number
	height: number
}

export type VisibleRange = {
	startLine: number
	endLine: number
}

// ---------------------------------------------------------------------------
// Tab geometry
// ---------------------------------------------------------------------------

/**
 * Compute visual column width for a tab at a given visual column.
 * Tabs advance to the next tab stop.
 */
export const tabAdvance = (visualColumn: number, tabSize: number): number =>
	tabSize - (visualColumn % tabSize)

/**
 * Compute the visual column for a given character index in a line.
 * Tabs expand to tab stops; other characters are width 1.
 */
export const charIndexToVisualColumn = (
	lineText: string,
	charIndex: number,
	tabSize: number
): number => {
	let visualColumn = 0
	const end = Math.min(charIndex, lineText.length)
	for (let i = 0; i < end; i++) {
		if (lineText[i] === '\t') {
			visualColumn += tabAdvance(visualColumn, tabSize)
		} else {
			visualColumn += 1
		}
	}
	return visualColumn
}

/**
 * Compute the character index for a given visual column in a line.
 * Returns the character index at or after the target visual column.
 */
export const visualColumnToCharIndex = (
	lineText: string,
	targetVisualColumn: number,
	tabSize: number
): number => {
	let visualColumn = 0
	for (let i = 0; i < lineText.length; i++) {
		if (visualColumn >= targetVisualColumn) return i
		if (lineText[i] === '\t') {
			visualColumn += tabAdvance(visualColumn, tabSize)
		} else {
			visualColumn += 1
		}
	}
	return lineText.length
}

// ---------------------------------------------------------------------------
// Pixel measurements
// ---------------------------------------------------------------------------

/**
 * Convert a character column to an X pixel offset within a line.
 */
export const columnToX = (
	lineText: string,
	column: number,
	metrics: EditorMetrics
): number => {
	const visualCol = charIndexToVisualColumn(lineText, column, metrics.tabSize)
	return visualCol * metrics.charWidth
}

/**
 * Convert an X pixel offset to a character column within a line.
 */
export const xToColumn = (
	lineText: string,
	x: number,
	metrics: EditorMetrics
): number => {
	const targetVisualCol = Math.round(x / metrics.charWidth)
	return visualColumnToCharIndex(lineText, targetVisualCol, metrics.tabSize)
}

/**
 * Determine which line index a client Y coordinate corresponds to.
 * Returns -1 if above the content, or lineCount if below.
 */
export const lineFromClientY = (
	clientY: number,
	contentTop: number,
	scrollTop: number,
	lineHeight: number,
	lineCount: number
): number => {
	const relativeY = clientY - contentTop + scrollTop
	const lineIndex = Math.floor(relativeY / lineHeight)
	return Math.max(0, Math.min(lineIndex, lineCount - 1))
}

/**
 * Get the caret rectangle for a position in the editor.
 */
export const getCaretRect = (
	lineText: string,
	column: number,
	lineIndex: number,
	contentTop: number,
	scrollTop: number,
	metrics: EditorMetrics
): CaretRect => {
	const x = columnToX(lineText, column, metrics)
	const y = contentTop + lineIndex * metrics.lineHeight - scrollTop
	return {
		x,
		y,
		width: Math.max(1, metrics.charWidth), // beam cursor = 1px, block = charWidth
		height: metrics.lineHeight,
	}
}

// ---------------------------------------------------------------------------
// Visible range computation
// ---------------------------------------------------------------------------

/**
 * Compute the range of lines visible in the viewport, plus overscan.
 */
export const computeVisibleRange = (
	scrollTop: number,
	viewportHeight: number,
	lineHeight: number,
	lineCount: number,
	overscanLines: number
): VisibleRange => {
	if (lineCount === 0 || lineHeight <= 0) {
		return { startLine: 0, endLine: 0 }
	}

	const firstVisible = Math.floor(scrollTop / lineHeight)
	const lastVisible = Math.ceil((scrollTop + viewportHeight) / lineHeight)

	const endLine = Math.min(lineCount, lastVisible + overscanLines)
	// A stale scroll position can sit past the end of a shorter document.
	// Clamp so the range never inverts — an inverted range renders nothing.
	const startLine = Math.min(Math.max(0, firstVisible - overscanLines), endLine)

	return { startLine, endLine }
}

/**
 * Compute the pool size for row elements.
 * Formula from RFC: min(visibleRows + 2 * overscan, 200)
 */
export const computePoolSize = (
	viewportHeight: number,
	lineHeight: number
): { visibleRows: number; overscanRows: number; poolSize: number } => {
	const visibleRows = lineHeight > 0 ? Math.ceil(viewportHeight / lineHeight) : 0
	const overscanRows = Math.min(20, Math.max(8, Math.ceil(visibleRows / 2)))
	const poolSize = Math.min(visibleRows + 2 * overscanRows, 200)
	return { visibleRows, overscanRows, poolSize }
}

// ---------------------------------------------------------------------------
// Font measurement
// ---------------------------------------------------------------------------

/**
 * Measure the character width and line height of the current font.
 * Must be called with an element that has the editor's font applied.
 */
export const measureFont = (container: HTMLElement): { charWidth: number; lineHeight: number } => {
	const probe = document.createElement('span')
	probe.style.position = 'absolute'
	probe.style.visibility = 'hidden'
	probe.style.whiteSpace = 'pre'
	probe.textContent = 'X'.repeat(100)
	container.appendChild(probe)

	const rect = probe.getBoundingClientRect()
	const charWidth = rect.width / 100
	const lineHeight = rect.height

	container.removeChild(probe)

	return { charWidth: charWidth || 8, lineHeight: lineHeight || 18 }
}
