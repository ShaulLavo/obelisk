import type { TextRun } from '../line/utils/textRuns'

/**
 * Pre-computed render data for a single line, ready to display instantly.
 */
export type CachedLineRender = {
	/** Stable line identity */
	lineId: number
	/** The line index in the document */
	lineIndex: number
	/** Start column of the visible portion (for horizontal virtualization) */
	columnStart: number
	/** End column of the visible portion */
	columnEnd: number
	/** Pre-computed text runs with syntax highlighting and bracket coloring */
	runs: TextRun[]
}

/**
 * Snapshot of visible content at the time of tab switch.
 * Used to render instantly when switching back to a file.
 */
export type VisibleContentSnapshot = {
	/** Scroll position to restore */
	scrollTop: number
	scrollLeft: number
	/** Viewport dimensions at capture time */
	viewportHeight: number
	viewportWidth: number
	/** Pre-computed line renders for visible lines */
	lines: CachedLineRender[]
}
