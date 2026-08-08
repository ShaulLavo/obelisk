/**
 * lineHtml — row cache key and HTML generation for visible lines.
 *
 * Each row tracks a cache key:
 *   (lineId, lineRevision, decorationRevision, themeVersion, renderMode)
 *
 * If all values are unchanged, the row does not rerender its text HTML.
 *
 * Two render modes:
 * - 'plain': textContent (no decorations)
 * - 'decorated': innerHTML with highlight/bracket spans
 */

import {
	type HighlightSegment,
	type BracketDepthMap,
	hasDecorations,
	buildTextRuns,
	renderTextRunsHtml,
} from './textRuns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RenderMode = 'plain' | 'decorated'

export type RowCacheKey = {
	lineId: number
	lineRevision: number
	decorationRevision: number
	themeVersion: number
	renderMode: RenderMode
}

export type LineRenderInput = {
	lineId: number
	lineRevision: number
	decorationRevision: number
	themeVersion: number
	text: string
	highlights: HighlightSegment[] | null
	bracketDepths: BracketDepthMap | null
}

// ---------------------------------------------------------------------------
// Cache key comparison
// ---------------------------------------------------------------------------

export const cacheKeyEquals = (a: RowCacheKey, b: RowCacheKey): boolean =>
	a.lineId === b.lineId &&
	a.lineRevision === b.lineRevision &&
	a.decorationRevision === b.decorationRevision &&
	a.themeVersion === b.themeVersion &&
	a.renderMode === b.renderMode

// ---------------------------------------------------------------------------
// Render mode detection
// ---------------------------------------------------------------------------

export const detectRenderMode = (input: LineRenderInput): RenderMode =>
	hasDecorations(input.highlights, input.bracketDepths) ? 'decorated' : 'plain'

// ---------------------------------------------------------------------------
// Build cache key from render input
// ---------------------------------------------------------------------------

export const buildCacheKey = (input: LineRenderInput): RowCacheKey => ({
	lineId: input.lineId,
	lineRevision: input.lineRevision,
	decorationRevision: input.decorationRevision,
	themeVersion: input.themeVersion,
	renderMode: detectRenderMode(input),
})

// ---------------------------------------------------------------------------
// Apply render to a DOM element
// ---------------------------------------------------------------------------

const defaultGetDepthClass = (depth: number): string =>
	`bracket-depth-${((depth - 1) % 6) + 1}`

/**
 * Render a line into a DOM element, using the appropriate path.
 *
 * Returns the new cache key if the element was updated,
 * or null if the element was already up-to-date.
 */
export const renderLine = (
	element: HTMLElement,
	input: LineRenderInput,
	prevKey: RowCacheKey | null,
	getDepthClass?: (depth: number) => string
): RowCacheKey | null => {
	const newKey = buildCacheKey(input)

	if (prevKey && cacheKeyEquals(prevKey, newKey)) {
		return null // up-to-date, no rerender needed
	}

	if (newKey.renderMode === 'plain') {
		// Plain text fast path
		element.textContent = input.text
	} else {
		// Decorated HTML path
		const runs = buildTextRuns(input.text, input.highlights, input.bracketDepths)
		const html = renderTextRunsHtml(runs, getDepthClass ?? defaultGetDepthClass)
		element.innerHTML = html
	}

	return newKey
}
