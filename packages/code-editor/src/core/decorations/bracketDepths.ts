/**
 * bracketDepths — per-line bracket depth maps from absolute bracket data.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BracketInfo = {
	offset: number
	depth: number
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert absolute bracket depth data to per-line depth maps.
 *
 * @param brackets Absolute bracket positions from the worker.
 * @param lineStarts Array of line start offsets.
 * @param lineIds Array of line IDs (parallel to lineStarts).
 * @returns Map from line ID to bracket depth maps (column → depth).
 */
export const absoluteToPerLineBrackets = (
	brackets: BracketInfo[],
	lineStarts: number[],
	lineIds: number[]
): Map<number, Record<number, number>> => {
	const result = new Map<number, Record<number, number>>()
	if (brackets.length === 0 || lineStarts.length === 0) return result

	const lineCount = lineStarts.length
	let lineIdx = 0

	for (const bracket of brackets) {
		// Advance to the line containing this bracket
		while (lineIdx < lineCount - 1 && lineStarts[lineIdx + 1]! <= bracket.offset) {
			lineIdx++
		}

		const lineId = lineIds[lineIdx]!
		const column = bracket.offset - lineStarts[lineIdx]!

		let depthMap = result.get(lineId)
		if (!depthMap) {
			depthMap = {}
			result.set(lineId, depthMap)
		}
		depthMap[column] = bracket.depth
	}

	return result
}
