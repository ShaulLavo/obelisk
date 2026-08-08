/**
 * decorationSegments — converts absolute highlight ranges to per-line segments.
 *
 * Worker results arrive as absolute document ranges.
 * This module converts them to per-line segments keyed by line ID.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HighlightRange = {
	start: number
	end: number
	className: string
	scope: string
}

export type LineHighlightSegment = {
	start: number
	end: number
	className: string
	scope: string
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert absolute highlight ranges to per-line segments.
 *
 * @param ranges Absolute document ranges from the worker.
 * @param lineStarts Array of line start offsets.
 * @param lineIds Array of line IDs (parallel to lineStarts).
 * @returns Map from line ID to highlight segments (line-local offsets).
 */
export const absoluteToPerLine = (
	ranges: HighlightRange[],
	lineStarts: number[],
	lineIds: number[]
): Map<number, LineHighlightSegment[]> => {
	const result = new Map<number, LineHighlightSegment[]>()
	if (ranges.length === 0 || lineStarts.length === 0) return result

	const lineCount = lineStarts.length

	// For each range, find overlapping lines and split
	let lineIdx = 0
	for (const range of ranges) {
		if (range.end <= range.start) continue

		// Advance lineIdx to the line containing range.start
		while (lineIdx < lineCount - 1 && lineStarts[lineIdx + 1]! <= range.start) {
			lineIdx++
		}

		// Walk lines that this range overlaps
		for (let i = lineIdx; i < lineCount; i++) {
			const lineStart = lineStarts[i]!
			const lineEnd = i + 1 < lineCount ? lineStarts[i + 1]! : Infinity

			if (lineStart >= range.end) break

			const segStart = Math.max(0, range.start - lineStart)
			const segEnd = Math.min(lineEnd - lineStart, range.end - lineStart)

			if (segEnd <= segStart) continue

			const lineId = lineIds[i]!
			let segments = result.get(lineId)
			if (!segments) {
				segments = []
				result.set(lineId, segments)
			}
			segments.push({
				start: segStart,
				end: segEnd,
				className: range.className,
				scope: range.scope,
			})
		}
	}

	return result
}
