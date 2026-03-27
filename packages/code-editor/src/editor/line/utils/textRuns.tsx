import type { LineBracketDepthMap, LineHighlightSegment, TextRun } from '../../types'

export type { TextRun }

export type NormalizedHighlightSegment = {
	start: number
	end: number
	className: string
	scope: string
}

const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')

export const buildTextRunsHtml = (
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

export const normalizeHighlightSegments = (
	segments: LineHighlightSegment[] | undefined,
	textLength: number
): NormalizedHighlightSegment[] => {
	if (!segments?.length) {
		return []
	}

	let prevEnd = 0
	let isNormalized = true
	for (let i = 0; i < segments.length; i += 1) {
		const segment = segments[i]
		if (!segment) {
			isNormalized = false
			break
		}
		const start = segment.start
		const end = segment.end
		if (start < 0 || end > textLength || end <= start) {
			isNormalized = false
			break
		}
		if (start < prevEnd) {
			isNormalized = false
			break
		}
		prevEnd = end
	}

	if (isNormalized) {
		return segments as NormalizedHighlightSegment[]
	}

	const clamped = segments
		.map((segment) => {
			const start = Math.max(0, Math.min(textLength, segment.start))
			const end = Math.max(0, Math.min(textLength, segment.end))
			return {
				start,
				end,
				className: segment.className,
				scope: segment.scope,
			}
		})
		.filter((segment) => segment.end > segment.start)
		.sort((a, b) => a.start - b.start)

	const normalized: NormalizedHighlightSegment[] = []
	let cursor = 0

	for (const segment of clamped) {
		const start = Math.max(cursor, segment.start)
		const end = Math.max(start, segment.end)
		if (end <= start) continue
		normalized.push({
			start,
			end,
			className: segment.className,
			scope: segment.scope,
		})
		cursor = end
	}

	return normalized
}

/**
 * Build text runs by iterating through the text and grouping consecutive
 * characters with the same styling (bracket depth + highlight) together.
 * This is much more efficient than creating a span per character.
 */
export const buildTextRuns = (
	text: string,
	depthMap: LineBracketDepthMap | undefined,
	highlights: NormalizedHighlightSegment[],
	startIndex: number,
	endIndex: number
): TextRun[] => {
	if (text.length === 0) return []

	const runs: TextRun[] = []

	let highlightIdx = 0
	// Optimization: Skip highlights that end before our start index
	const safeStartIndex = Math.max(0, Math.min(text.length, startIndex))
	const safeEndIndex = Math.min(text.length, Math.max(safeStartIndex, endIndex))
	if (safeEndIndex <= safeStartIndex) return []

	while (
		highlightIdx < highlights.length &&
		highlights[highlightIdx]!.end <= safeStartIndex
	) {
		highlightIdx++
	}

	const numHighlights = highlights.length
	let currentHighlight: NormalizedHighlightSegment | undefined =
		highlightIdx < numHighlights ? highlights[highlightIdx] : undefined

	let runStart = safeStartIndex
	let runDepth: number | undefined
	let runHighlightClass: string | undefined
	let runHighlightScope: string | undefined

	for (let i = safeStartIndex; i < safeEndIndex; i++) {
		// 1. Advance the highlight cursor if we've passed the current one
		while (currentHighlight && i >= currentHighlight.end) {
			highlightIdx++
			currentHighlight =
				highlightIdx < numHighlights ? highlights[highlightIdx] : undefined
		}

		// 2. Simply check if we are inside the current highlight (no searching needed)
		let activeHighlight: NormalizedHighlightSegment | undefined
		if (currentHighlight && i >= currentHighlight.start) {
			activeHighlight = currentHighlight
		}

		const char = text[i]!
		const isBracketChar =
			char === '(' ||
			char === ')' ||
			char === '[' ||
			char === ']' ||
			char === '{' ||
			char === '}'
		const depth = isBracketChar ? depthMap?.[i] : undefined

		const highlightClass = activeHighlight?.className
		const highlightScope = activeHighlight?.scope

		if (i === safeStartIndex) {
			runDepth = depth
			runHighlightClass = highlightClass
			runHighlightScope = highlightScope
			continue
		}

		const needsBreak =
			depth !== runDepth ||
			highlightClass !== runHighlightClass ||
			highlightScope !== runHighlightScope

		if (needsBreak) {
			runs.push({
				text: text.slice(runStart, i),
				depth: runDepth,
				highlightClass: runHighlightClass,
				highlightScope: runHighlightScope,
			})
			runStart = i
			runDepth = depth
			runHighlightClass = highlightClass
			runHighlightScope = highlightScope
		}
	}

	runs.push({
		text: text.slice(runStart, safeEndIndex),
		depth: runDepth,
		highlightClass: runHighlightClass,
		highlightScope: runHighlightScope,
	})

	return runs
}
