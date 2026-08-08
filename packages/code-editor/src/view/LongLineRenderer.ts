/**
 * LongLineRenderer — isolated renderer for pathological long lines.
 *
 * Normal lines render their full text. Long lines (exceeding the threshold)
 * render only a horizontal slice visible in the viewport.
 *
 * This keeps long-line complexity out of the normal line renderer.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Lines longer than this threshold (in characters) use the long-line renderer. */
export const LONG_LINE_RENDER_THRESHOLD = 5000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LongLineSlice = {
	/** Character index where the visible slice starts. */
	startChar: number
	/** Character index where the visible slice ends (exclusive). */
	endChar: number
	/** The slice of text to render. */
	text: string
	/** Pixel offset from the left edge of the full line. */
	offsetX: number
}

// ---------------------------------------------------------------------------
// Slice computation
// ---------------------------------------------------------------------------

/**
 * Check if a line needs long-line rendering.
 */
export const isLongLine = (textLength: number): boolean =>
	textLength > LONG_LINE_RENDER_THRESHOLD

/**
 * Compute the horizontal slice to render for a long line.
 *
 * @param lineText Full line text.
 * @param scrollLeft Current horizontal scroll position in pixels.
 * @param viewportWidth Viewport width in pixels.
 * @param charWidth Character width in pixels.
 * @param tabSize Tab size in characters.
 * @returns The slice to render, plus padding for smooth scrolling.
 */
export const computeLongLineSlice = (
	lineText: string,
	scrollLeft: number,
	viewportWidth: number,
	charWidth: number,
	tabSize: number
): LongLineSlice => {
	// Add padding chars on each side for smooth scrolling
	const paddingChars = 100

	// Estimate the character range visible in the viewport
	const firstVisibleChar = Math.max(0, Math.floor(scrollLeft / charWidth) - paddingChars)
	const lastVisibleChar = Math.min(
		lineText.length,
		Math.ceil((scrollLeft + viewportWidth) / charWidth) + paddingChars
	)

	const text = lineText.slice(firstVisibleChar, lastVisibleChar)

	// Compute the pixel offset for the slice start
	// (simplified: assumes monospace without tabs for offset calculation)
	let offsetX = 0
	let visualCol = 0
	for (let i = 0; i < firstVisibleChar && i < lineText.length; i++) {
		if (lineText[i] === '\t') {
			const advance = tabSize - (visualCol % tabSize)
			visualCol += advance
		} else {
			visualCol++
		}
	}
	offsetX = visualCol * charWidth

	return {
		startChar: firstVisibleChar,
		endChar: lastVisibleChar,
		text,
		offsetX,
	}
}

/**
 * Render a long line slice into a DOM element.
 * The element is positioned with a left offset to align correctly.
 */
export const renderLongLineSlice = (
	element: HTMLElement,
	slice: LongLineSlice
): void => {
	element.textContent = slice.text
	element.style.transform = `translateX(${slice.offsetX}px)`
}
