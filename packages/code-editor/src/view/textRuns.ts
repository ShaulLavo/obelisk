/**
 * textRuns — builds styled text run HTML for line rendering.
 *
 * Reuses the existing TextRun / LineHighlightSegment / LineBracketDepthMap
 * types from the editor for compatibility with the decoration pipeline.
 *
 * Two render paths:
 * 1. Plain text fast path: textContent (no decorations)
 * 2. Decorated HTML path: innerHTML with highlight/bracket spans
 */

// ---------------------------------------------------------------------------
// Types (re-exported for convenience)
// ---------------------------------------------------------------------------

export type HighlightSegment = {
	start: number
	end: number
	className: string
	scope: string
}

export type BracketDepthMap = Record<number, number>

export type TextRun = {
	text: string
	depth?: number
	highlightClass?: string
	highlightScope?: string
}

// ---------------------------------------------------------------------------
// HTML escape
// ---------------------------------------------------------------------------

const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')

// ---------------------------------------------------------------------------
// Check if a line needs decoration rendering
// ---------------------------------------------------------------------------

export const hasDecorations = (
	highlights: HighlightSegment[] | null | undefined,
	bracketDepths: BracketDepthMap | null | undefined
): boolean => {
	if (highlights && highlights.length > 0) return true
	if (bracketDepths && Object.keys(bracketDepths).length > 0) return true
	return false
}

// ---------------------------------------------------------------------------
// Build text runs from line text + decorations
// ---------------------------------------------------------------------------

export const buildTextRuns = (
	text: string,
	highlights: HighlightSegment[] | null | undefined,
	bracketDepths: BracketDepthMap | null | undefined
): TextRun[] => {
	if (text.length === 0) return []

	const safeHighlights = highlights ?? []
	const safeBrackets = bracketDepths ?? {}
	const runs: TextRun[] = []

	let highlightIdx = 0
	let runStart = 0

	for (let i = 0; i < text.length; i++) {
		// Advance highlight cursor past the current position
		while (highlightIdx < safeHighlights.length && safeHighlights[highlightIdx]!.end <= i) {
			highlightIdx++
		}

		const activeHighlight =
			highlightIdx < safeHighlights.length && i >= safeHighlights[highlightIdx]!.start
				? safeHighlights[highlightIdx]
				: undefined

		const char = text[i]!
		const isBracket = char === '(' || char === ')' || char === '[' || char === ']' || char === '{' || char === '}'
		const depth = isBracket ? (safeBrackets[i] ?? 0) : 0

		const hClass = activeHighlight?.className
		const hScope = activeHighlight?.scope

		// Check if this character can extend the current run
		if (runs.length > 0) {
			const prev = runs[runs.length - 1]!
			if (
				(prev.depth ?? 0) === depth &&
				prev.highlightClass === hClass &&
				prev.highlightScope === hScope
			) {
				prev.text += char
				continue
			}
		}

		runs.push({
			text: char,
			depth: depth > 0 ? depth : undefined,
			highlightClass: hClass,
			highlightScope: hScope,
		})
	}

	return runs
}

// ---------------------------------------------------------------------------
// Render text runs to HTML
// ---------------------------------------------------------------------------

export const renderTextRunsHtml = (
	runs: TextRun[],
	getDepthClass: (depth: number) => string
): string => {
	if (runs.length === 0) return ''

	let html = ''
	for (const run of runs) {
		const text = escapeHtml(run.text)
		const hasDepth = run.depth !== undefined && run.depth > 0
		const hasHighlight = Boolean(run.highlightClass)

		if (!hasDepth && !hasHighlight) {
			html += text
			continue
		}

		if (hasDepth && !hasHighlight) {
			const depthClass = escapeHtml(getDepthClass(run.depth!))
			html += `<span class="${depthClass}" data-depth="${run.depth}">${text}</span>`
			continue
		}

		if (!hasDepth && hasHighlight) {
			const className = escapeHtml(run.highlightClass ?? '')
			const scope = escapeHtml(run.highlightScope ?? '')
			html += `<span class="${className}" data-highlight-scope="${scope}">${text}</span>`
			continue
		}

		const className = escapeHtml(run.highlightClass ?? '')
		const scope = escapeHtml(run.highlightScope ?? '')
		const depthClass = escapeHtml(getDepthClass(run.depth!))
		html += `<span class="${className}" data-highlight-scope="${scope}"><span class="${depthClass}" data-depth="${run.depth}">${text}</span></span>`
	}

	return html
}
