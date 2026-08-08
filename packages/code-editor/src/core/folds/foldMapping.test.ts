import { describe, it, expect } from 'vitest'
import { createFoldState, addFoldRegion, toggleFold } from './FoldModel'
import { buildFoldMapping } from './foldMapping'

// 5 lines, IDs 10-14
const lineCount = 5
const lineIdByIndex = [10, 11, 12, 13, 14]
const lineIndexById = new Map(lineIdByIndex.map((id, i) => [id, i]))
const getLineIndex = (id: number) => lineIndexById.get(id) ?? 0

describe('foldMapping', () => {
	describe('no folds', () => {
		it('maps 1:1 with no folds', () => {
			const state = createFoldState()
			const mapping = buildFoldMapping(state, lineCount, getLineIndex)

			expect(mapping.displayRowCount).toBe(5)
			for (let i = 0; i < 5; i++) {
				expect(mapping.lineToDisplayRow(i)).toBe(i)
				expect(mapping.displayRowToLine(i)).toBe(i)
				expect(mapping.isLineHidden(i)).toBe(false)
			}
		})
	})

	describe('single fold', () => {
		it('hides folded lines', () => {
			let state = createFoldState()
			// Fold from line 1 (ID 11) to line 3 (ID 13) — hides lines 2 and 3 (index-based: line 1 header stays visible, lines 2-3 hidden)
			state = addFoldRegion(state, 11, 13)
			state = toggleFold(state, 11, true)

			const mapping = buildFoldMapping(state, lineCount, getLineIndex)

			// Lines 2 and 3 (index) are hidden (between startIndex+1 and endIndex-1)
			expect(mapping.isLineHidden(0)).toBe(false)
			expect(mapping.isLineHidden(1)).toBe(false) // fold header
			expect(mapping.isLineHidden(2)).toBe(true) // hidden
			expect(mapping.isLineHidden(3)).toBe(false) // endLine is exclusive boundary
			expect(mapping.isLineHidden(4)).toBe(false)

			expect(mapping.displayRowCount).toBe(4) // 5 - 1 hidden
		})

		it('display row maps to correct document line', () => {
			let state = createFoldState()
			state = addFoldRegion(state, 11, 13)
			state = toggleFold(state, 11, true)

			const mapping = buildFoldMapping(state, lineCount, getLineIndex)

			expect(mapping.displayRowToLine(0)).toBe(0)
			expect(mapping.displayRowToLine(1)).toBe(1) // fold header
			expect(mapping.displayRowToLine(2)).toBe(3) // skips hidden line 2
			expect(mapping.displayRowToLine(3)).toBe(4)
		})

		it('hidden line returns -1 for display row', () => {
			let state = createFoldState()
			state = addFoldRegion(state, 11, 13)
			state = toggleFold(state, 11, true)

			const mapping = buildFoldMapping(state, lineCount, getLineIndex)
			expect(mapping.lineToDisplayRow(2)).toBe(-1)
		})
	})

	describe('unfold', () => {
		it('unfolding restores all lines', () => {
			let state = createFoldState()
			state = addFoldRegion(state, 11, 13)
			state = toggleFold(state, 11, true)
			state = toggleFold(state, 11, false) // unfold

			const mapping = buildFoldMapping(state, lineCount, getLineIndex)
			expect(mapping.displayRowCount).toBe(5)
			for (let i = 0; i < 5; i++) {
				expect(mapping.isLineHidden(i)).toBe(false)
			}
		})
	})
})
