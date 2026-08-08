/**
 * foldMapping — converts between document lines and display rows
 * accounting for collapsed fold regions.
 *
 * The mapping is recomputed whenever fold state changes.
 * It does not own fold state — it reads from FoldModel.
 */

import type { FoldState } from './FoldModel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FoldMapping = {
	/** Total display row count (document lines minus hidden lines). */
	displayRowCount: number
	/** Convert a document line index to a display row index. Returns -1 if hidden. */
	lineToDisplayRow(lineIndex: number): number
	/** Convert a display row index to a document line index. */
	displayRowToLine(displayRow: number): number
	/** Whether a document line is hidden by a fold. */
	isLineHidden(lineIndex: number): boolean
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build a fold mapping from the current fold state.
 *
 * @param foldState The current fold state.
 * @param lineCount Total number of document lines.
 * @param getLineIndex Convert line ID → line index.
 */
export const buildFoldMapping = (
	foldState: FoldState,
	lineCount: number,
	getLineIndex: (lineId: number) => number
): FoldMapping => {
	// Build a set of hidden line indices from collapsed folds
	const hiddenLines = new Set<number>()

	for (const region of foldState.regions.values()) {
		if (!region.collapsed) continue

		const startIndex = getLineIndex(region.startLineId)
		let endIndex: number
		try {
			endIndex = getLineIndex(region.endLineId)
		} catch {
			endIndex = lineCount
		}

		// Hide lines from startIndex+1 to endIndex-1 (the fold header stays visible)
		for (let i = startIndex + 1; i < endIndex; i++) {
			hiddenLines.add(i)
		}
	}

	// Build line→displayRow mapping
	const lineToRow = new Int32Array(lineCount)
	const rowToLine: number[] = []
	let displayRow = 0

	for (let i = 0; i < lineCount; i++) {
		if (hiddenLines.has(i)) {
			lineToRow[i] = -1
		} else {
			lineToRow[i] = displayRow
			rowToLine.push(i)
			displayRow++
		}
	}

	return {
		displayRowCount: rowToLine.length,

		lineToDisplayRow(lineIndex: number): number {
			if (lineIndex < 0 || lineIndex >= lineCount) return -1
			return lineToRow[lineIndex]!
		},

		displayRowToLine(row: number): number {
			if (row < 0 || row >= rowToLine.length) {
				return Math.max(0, lineCount - 1)
			}
			return rowToLine[row]!
		},

		isLineHidden(lineIndex: number): boolean {
			return hiddenLines.has(lineIndex)
		},
	}
}
