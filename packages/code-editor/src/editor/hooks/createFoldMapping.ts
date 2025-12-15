import type { Accessor } from 'solid-js'
import type { FoldRange } from '../types'

export type FoldMapping = {
	/**
	 * Number of visible lines after applying folds.
	 */
	visibleCount: Accessor<number>

	/**
	 * Convert a display row index (0-based, what virtualizer sees)
	 * to the actual document line index.
	 */
	displayToLine: (displayIndex: number) => number

	/**
	 * Convert an actual document line index to display row index.
	 * Returns -1 if the line is hidden inside a folded region.
	 */
	lineToDisplay: (lineIndex: number) => number

	/**
	 * Check if a line is hidden inside a folded region.
	 */
	isLineHidden: (lineIndex: number) => boolean

	/**
	 * Check if a line is the header (start) of a currently folded region.
	 */
	isFoldHeader: (lineIndex: number) => boolean
}

export type FoldMappingOptions = {
	totalLines: Accessor<number>
	folds: Accessor<FoldRange[] | undefined>
	foldedStarts: Accessor<Set<number>>
}

/**
 * Represents a range of hidden lines [startHidden, endHidden] inclusive.
 * The fold header (startLine of the FoldRange) is NOT hidden.
 */
type HiddenRange = {
	/** First hidden line (startLine + 1 of the fold) */
	startHidden: number
	/** Last hidden line (endLine of the fold) */
	endHidden: number
	/** Number of lines hidden in this range */
	count: number
	/** Cumulative hidden lines before this range (exclusive) */
	cumulativeHiddenBefore: number
}

/**
 * Create fold mapping that translates between display indices and document line indices.
 *
 * When regions are folded, lines inside them are hidden from the display.
 * The virtualizer sees fewer rows, and we need to translate between:
 * - displayIndex: what the virtualizer uses (0 to visibleCount-1)
 * - lineIndex: actual line in the document (0 to totalLines-1)
 */
export function createFoldMapping(options: FoldMappingOptions): FoldMapping {
	let cachedFolds: FoldRange[] | undefined
	let cachedFoldedStarts: Set<number> | undefined
	let cachedFoldedStartsSize = -1
	let cachedHiddenRanges: HiddenRange[] = []
	let cachedTotalHiddenLines = 0

	const recompute = () => {
		const folds = options.folds()
		const foldedStarts = options.foldedStarts()

		if (
			folds === cachedFolds &&
			foldedStarts === cachedFoldedStarts &&
			foldedStarts.size === cachedFoldedStartsSize
		) {
			return
		}

		cachedFolds = folds
		cachedFoldedStarts = foldedStarts
		cachedFoldedStartsSize = foldedStarts.size

			if (!folds?.length || foldedStarts.size === 0) {
				cachedHiddenRanges = []
				cachedTotalHiddenLines = 0
				return
		}

		const activeFolds = folds.filter(
			(fold) =>
				foldedStarts.has(fold.startLine) && fold.endLine > fold.startLine
		)

		if (activeFolds.length === 0) {
			cachedHiddenRanges = []
			cachedTotalHiddenLines = 0
			return
		}

		const sorted = activeFolds.slice().sort((a, b) => a.startLine - b.startLine)

		const merged: Array<{ startHidden: number; endHidden: number }> = []

		for (const fold of sorted) {
			const startHidden = fold.startLine + 1
			const endHidden = fold.endLine

			if (startHidden > endHidden) continue

			const last = merged[merged.length - 1]
			if (!last) {
				merged.push({ startHidden, endHidden })
				continue
			}

			if (startHidden <= last.endHidden + 1) {
				last.endHidden = Math.max(last.endHidden, endHidden)
			} else {
				merged.push({ startHidden, endHidden })
			}
		}

		const result: HiddenRange[] = []
		let cumulativeHidden = 0

		for (const range of merged) {
			const count = range.endHidden - range.startHidden + 1
			result.push({
				startHidden: range.startHidden,
				endHidden: range.endHidden,
				count,
				cumulativeHiddenBefore: cumulativeHidden,
			})
			cumulativeHidden += count
		}

		cachedHiddenRanges = result
		cachedTotalHiddenLines = cumulativeHidden
	}

	const hiddenRanges = (): HiddenRange[] => {
		recompute()
		return cachedHiddenRanges
	}

	const totalHiddenLines = (): number => {
		recompute()
		return cachedTotalHiddenLines
	}

	const visibleCount: Accessor<number> = () => {
		const total = options.totalLines()
		const hidden = totalHiddenLines()
		return Math.max(0, total - hidden)
	}

	/**
	 * Binary search to find which hidden range (if any) contains a line.
	 * Returns the index of the range, or -1 if the line is not hidden.
	 */
	const findHiddenRangeContaining = (lineIndex: number): number => {
		const ranges = hiddenRanges()
		if (ranges.length === 0) return -1

		let lo = 0
		let hi = ranges.length - 1

		while (lo <= hi) {
			const mid = (lo + hi) >>> 1
			const range = ranges[mid]!

			if (lineIndex < range.startHidden) {
				hi = mid - 1
			} else if (lineIndex > range.endHidden) {
				lo = mid + 1
			} else {
				return mid
			}
		}

		return -1
	}

	/**
	 * Binary search to find how many lines are hidden before a given line.
	 */
	const countHiddenBefore = (lineIndex: number): number => {
		const ranges = hiddenRanges()
		if (ranges.length === 0) return 0

		let lo = 0
		let hi = ranges.length - 1
		let result = 0

		while (lo <= hi) {
			const mid = (lo + hi) >>> 1
			const range = ranges[mid]!

			if (range.endHidden < lineIndex) {
				// Entire range is before this line
				result = range.cumulativeHiddenBefore + range.count
				lo = mid + 1
			} else if (range.startHidden > lineIndex) {
				// Entire range is after this line
				hi = mid - 1
			} else {
				// Line is inside this range (hidden)
				// Count all hidden before this range + lines hidden before this line within the range
				result = range.cumulativeHiddenBefore + (lineIndex - range.startHidden)
				break
			}
		}

		return result
	}

	/**
	 * Convert display index to actual line index.
	 *
	 * displayIndex is what the virtualizer sees (0 to visibleCount-1).
	 * We need to find the actual line in the document.
	 *
	 * Algorithm: The displayed line at displayIndex is the line where:
	 * lineIndex - (total hidden lines before lineIndex) = displayIndex
	 *
	 * We can solve this by walking through hidden ranges and accumulating.
	 * For each range, if we haven't reached displayIndex yet in the
	 * visible lines before the range, we jump over the hidden range.
	 */
	const displayToLine = (displayIndex: number): number => {
		const ranges = hiddenRanges()

		if (ranges.length === 0) {
			// No folds - identity mapping
			return displayIndex
		}

		// We'll walk through the document, counting visible lines
		// until we've seen displayIndex + 1 visible lines.
		// The approach: figure out which "segment" the displayIndex falls into.
		//
		// Segments are: [0, range[0].startHidden - 1], then [range[0].endHidden + 1, range[1].startHidden - 1], etc.
		//
		// Each segment has some number of visible lines. We find which segment contains
		// the displayIndex and compute the actual line.

		let visibleSoFar = 0
		let prevEnd = -1 // End of previous hidden range (or -1 if none)

		for (const range of ranges) {
			// Visible lines in the gap between previous hidden range and this one
			const gapStart = prevEnd + 1
			const gapEnd = range.startHidden - 1
			const visibleInGap = gapEnd - gapStart + 1

			if (visibleInGap > 0 && visibleSoFar + visibleInGap > displayIndex) {
				// The target displayIndex is in this gap
				const offsetInGap = displayIndex - visibleSoFar
				return gapStart + offsetInGap
			}

			visibleSoFar += visibleInGap
			prevEnd = range.endHidden
		}

		// The displayIndex is after all hidden ranges
		const gapStart = prevEnd + 1
		const offsetInGap = displayIndex - visibleSoFar
		return gapStart + offsetInGap
	}

	/**
	 * Convert actual line index to display index.
	 * Returns -1 if the line is hidden.
	 */
	const lineToDisplay = (lineIndex: number): number => {
		// Check if this line is hidden
		if (findHiddenRangeContaining(lineIndex) !== -1) {
			return -1
		}

		// displayIndex = lineIndex - number of hidden lines before it
		return lineIndex - countHiddenBefore(lineIndex)
	}

	/**
	 * Check if a line is hidden inside a folded region.
	 */
	const isLineHidden = (lineIndex: number): boolean => {
		return findHiddenRangeContaining(lineIndex) !== -1
	}

	/**
	 * Check if a line is the header of a currently folded region.
	 */
	const isFoldHeader = (lineIndex: number): boolean => {
		return options.foldedStarts().has(lineIndex)
	}

	return {
		visibleCount,
		displayToLine,
		lineToDisplay,
		isLineHidden,
		isFoldHeader,
	}
}
