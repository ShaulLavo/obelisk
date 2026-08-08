import { describe, it, expect } from 'vitest'
import { createFoldState, addFoldRegion, toggleFold } from '../folds/FoldModel'
import { buildFoldMapping } from '../folds/foldMapping'
import {
	displayRowToDocumentLine,
	documentLineToDisplayRow,
	getDisplayRowCount,
	computeDisplayVisibleRange,
} from './displayMapping'

// 10 lines, IDs 100-109
const lineCount = 10
const lineIdByIndex = Array.from({ length: lineCount }, (_, i) => 100 + i)
const lineIndexById = new Map(lineIdByIndex.map((id, i) => [id, i]))
const getLineIndex = (id: number) => lineIndexById.get(id) ?? 0

describe('displayMapping utilities', () => {
	it('passes through with no folds', () => {
		const state = createFoldState()
		const mapping = buildFoldMapping(state, lineCount, getLineIndex)

		expect(getDisplayRowCount(mapping)).toBe(10)
		expect(displayRowToDocumentLine(mapping, 0)).toBe(0)
		expect(displayRowToDocumentLine(mapping, 9)).toBe(9)
		expect(documentLineToDisplayRow(mapping, 5)).toBe(5)
	})

	it('hides folded lines in display row mapping', () => {
		let state = createFoldState()
		// Fold lines 2-5 (ID 102 to 105): hides lines 3,4 (indices between start+1 and end)
		state = addFoldRegion(state, 102, 105)
		state = toggleFold(state, 102, true)

		const mapping = buildFoldMapping(state, lineCount, getLineIndex)

		expect(getDisplayRowCount(mapping)).toBe(8) // 10 - 2 hidden
		expect(documentLineToDisplayRow(mapping, 3)).toBe(-1) // hidden
		expect(documentLineToDisplayRow(mapping, 4)).toBe(-1) // hidden
		expect(documentLineToDisplayRow(mapping, 2)).toBe(2) // fold header, visible
		expect(documentLineToDisplayRow(mapping, 5)).toBe(3) // after fold
	})
})

// ---------------------------------------------------------------------------
// Folded viewport anchoring
// ---------------------------------------------------------------------------

describe('folded viewport anchoring', () => {
	it('computes correct visible range with folds', () => {
		let state = createFoldState()
		// Fold lines 2-5 (hide lines 3,4)
		state = addFoldRegion(state, 102, 105)
		state = toggleFold(state, 102, true)

		const mapping = buildFoldMapping(state, lineCount, getLineIndex)
		const lineHeight = 20
		const viewportHeight = 100 // 5 rows visible
		const overscan = 2

		// scrollTop = 0: first visible rows
		const range1 = computeDisplayVisibleRange(mapping, 0, viewportHeight, lineHeight, overscan)
		expect(range1.startRow).toBe(0)
		expect(range1.endRow).toBeLessThanOrEqual(getDisplayRowCount(mapping))

		// The document lines for display rows should skip hidden lines
		expect(displayRowToDocumentLine(mapping, range1.startRow)).toBe(0)
	})

	it('maps display rows correctly when scrolled past a fold', () => {
		let state = createFoldState()
		// Fold lines 2-5 (hide lines 3,4)
		state = addFoldRegion(state, 102, 105)
		state = toggleFold(state, 102, true)

		const mapping = buildFoldMapping(state, lineCount, getLineIndex)
		const lineHeight = 20
		const viewportHeight = 60 // 3 rows visible
		const overscan = 1

		// Scroll to display row 4 (past the fold)
		const scrollTop = 4 * lineHeight
		const range = computeDisplayVisibleRange(mapping, scrollTop, viewportHeight, lineHeight, overscan)

		// All display rows in the range should map to valid, non-hidden document lines
		for (let r = range.startRow; r < range.endRow; r++) {
			const docLine = displayRowToDocumentLine(mapping, r)
			expect(docLine).toBeGreaterThanOrEqual(0)
			expect(docLine).toBeLessThan(lineCount)
			// The doc line should not be hidden
			expect(mapping.isLineHidden(docLine)).toBe(false)
		}
	})

	it('handles viewport at the end of a folded document', () => {
		let state = createFoldState()
		// Fold a large section: lines 1-8 (hide lines 2-7)
		state = addFoldRegion(state, 101, 108)
		state = toggleFold(state, 101, true)

		const mapping = buildFoldMapping(state, lineCount, getLineIndex)
		const lineHeight = 20

		// Only 4 display rows: 0, 1 (fold header), 8, 9
		expect(getDisplayRowCount(mapping)).toBe(4)

		// Scroll to the bottom
		const scrollTop = 3 * lineHeight
		const range = computeDisplayVisibleRange(mapping, scrollTop, 60, lineHeight, 1)

		expect(range.endRow).toBeLessThanOrEqual(4)

		// Last display row should map to document line 9
		expect(displayRowToDocumentLine(mapping, 3)).toBe(9)
	})

	it('returns empty range for zero-height viewport', () => {
		const state = createFoldState()
		const mapping = buildFoldMapping(state, lineCount, getLineIndex)
		const range = computeDisplayVisibleRange(mapping, 0, 0, 20, 2)
		expect(range.startRow).toBe(0)
		expect(range.endRow).toBeLessThanOrEqual(2) // just overscan
	})
})
