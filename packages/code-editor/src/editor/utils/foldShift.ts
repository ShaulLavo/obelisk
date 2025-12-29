import type { FoldRange, HighlightOffset } from '../types'

/**
 * Binary search to find the first fold index where endLine >= target.
 * Returns folds.length if no such fold exists.
 */
const findFirstAffectedFold = (
	folds: FoldRange[],
	targetLine: number
): number => {
	let lo = 0
	let hi = folds.length

	while (lo < hi) {
		const mid = (lo + hi) >>> 1
		if (folds[mid]!.endLine < targetLine) {
			lo = mid + 1
		} else {
			hi = mid
		}
	}

	return lo
}

/**
 * Binary search to find the first fold index where startLine > target.
 * Returns folds.length if no such fold exists.
 */
const findFirstFoldAfter = (
	folds: FoldRange[],
	targetLine: number,
	startIdx: number
): number => {
	let lo = startIdx
	let hi = folds.length

	while (lo < hi) {
		const mid = (lo + hi) >>> 1
		if (folds[mid]!.startLine <= targetLine) {
			lo = mid + 1
		} else {
			hi = mid
		}
	}

	return lo
}

/**
 * Shift fold ranges based on edit offsets.
 * Similar to highlight offset logic, but operates on line numbers instead of character indices.
 *
 * When a line is added/removed, folds that start or end after the edit need to be shifted.
 *
 * Optimized:
 * - Fast path for single-char edits (no line changes)
 * - Binary search to skip folds before the edit
 * - Batch shift for folds entirely after the edit
 */
export const shiftFoldRanges = (
	folds: FoldRange[] | undefined,
	offsets: HighlightOffset[] | undefined
): FoldRange[] | undefined => {
	if (!folds?.length || !offsets?.length) {
		return folds
	}

	// Filter to only offsets that actually change line numbers
	// Character-level changes (lineDelta === 0) don't affect fold ranges
	const lineChangingOffsets: HighlightOffset[] = []
	let minFromRow = Infinity
	let maxOldEndRow = -Infinity
	let totalLineDelta = 0

	for (const offset of offsets) {
		if (offset.lineDelta !== 0 || offset.oldEndRow !== offset.newEndRow) {
			lineChangingOffsets.push(offset)
			minFromRow = Math.min(minFromRow, offset.fromLineRow)
			maxOldEndRow = Math.max(maxOldEndRow, offset.oldEndRow)
			totalLineDelta += offset.lineDelta
		}
	}

	if (lineChangingOffsets.length === 0) {
		// No line changes - folds are unchanged (fast path!)
		return folds
	}

	// Find first fold that might be affected (endLine >= minFromRow)
	const startIdx = findFirstAffectedFold(folds, minFromRow)

	if (startIdx >= folds.length) {
		// All folds are before the edit - no changes needed
		return folds
	}

	// Find first fold that's entirely after the edit (startLine > maxOldEndRow)
	// These can be batch-shifted without complex logic
	const batchShiftIdx = findFirstFoldAfter(folds, maxOldEndRow, startIdx)

	// Copy unaffected folds directly
	const result: FoldRange[] = folds.slice(0, startIdx)

	// Process folds that intersect the edit (need complex logic)
	for (let i = startIdx; i < batchShiftIdx; i++) {
		const fold = folds[i]!
		let startLine = fold.startLine
		let endLine = fold.endLine

		for (const offset of lineChangingOffsets) {
			const lineDelta = offset.lineDelta
			const fromRow = offset.fromLineRow
			const oldEndRow = offset.oldEndRow
			const newEndRow = offset.newEndRow

			// No need to check lineDelta === 0 anymore since lineChangingOffsets is pre-filtered

			if (endLine < fromRow) {
				continue
			}

			if (startLine > oldEndRow) {
				startLine += lineDelta
				endLine += lineDelta
				continue
			}

			const isInsertAtFoldStart =
				lineDelta > 0 && startLine === fromRow && oldEndRow === fromRow

			if (isInsertAtFoldStart) {
				startLine += lineDelta
				endLine += lineDelta
				continue
			}

			if (startLine <= fromRow) {
				if (endLine > oldEndRow) {
					endLine += lineDelta
				} else if (endLine >= fromRow && endLine <= oldEndRow) {
					if (lineDelta < 0) {
						endLine = Math.max(startLine + 1, newEndRow)
					} else {
						endLine = newEndRow
					}
				}
			} else {
				if (lineDelta > 0) {
					const shiftAmount = startLine - fromRow
					startLine = newEndRow + shiftAmount - (oldEndRow - fromRow)
					endLine += lineDelta
				} else {
					startLine = fromRow
					endLine = Math.max(startLine + 1, endLine + lineDelta)
				}
			}
		}

		if (endLine > startLine && startLine >= 0) {
			result.push({
				startLine,
				endLine,
				type: fold.type,
			})
		}
	}

	// Batch-shift folds that are entirely after the edit
	// These just need startLine += totalLineDelta and endLine += totalLineDelta
	for (let i = batchShiftIdx; i < folds.length; i++) {
		const fold = folds[i]!
		result.push({
			startLine: fold.startLine + totalLineDelta,
			endLine: fold.endLine + totalLineDelta,
			type: fold.type,
		})
	}

	return result.length > 0 ? result : undefined
}
