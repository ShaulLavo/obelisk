import { describe, expect, it } from 'bun:test'
import { createRoot, createSignal } from 'solid-js'
import { createFoldMapping, type FoldMappingOptions } from './createFoldMapping'
import type { FoldRange } from '../types'

/**
 * Helper to create fold mapping in a reactive root and run tests.
 */
const runWithMapping = <T>(
	options: {
		totalLines: number
		folds?: FoldRange[]
		foldedStarts?: Set<number>
	},
	fn: (mapping: ReturnType<typeof createFoldMapping>) => T
): T => {
	return createRoot((dispose) => {
		const [totalLines] = createSignal(options.totalLines)
		const [folds] = createSignal(options.folds)
		const [foldedStarts] = createSignal<Set<number>>(
			options.foldedStarts ?? new Set<number>()
		)

		const mapping = createFoldMapping({
			totalLines,
			folds,
			foldedStarts,
		})

		const result = fn(mapping)
		dispose()
		return result
	})
}

describe('createFoldMapping', () => {
	describe('no folds', () => {
		it('returns identity mapping when no folds are defined', () => {
			runWithMapping({ totalLines: 10, folds: [] }, (mapping) => {
				expect(mapping.visibleCount()).toBe(10)
				expect(mapping.displayToLine(0)).toBe(0)
				expect(mapping.displayToLine(5)).toBe(5)
				expect(mapping.displayToLine(9)).toBe(9)
				expect(mapping.lineToDisplay(0)).toBe(0)
				expect(mapping.lineToDisplay(5)).toBe(5)
				expect(mapping.isLineHidden(0)).toBe(false)
				expect(mapping.isLineHidden(5)).toBe(false)
			})
		})

		it('returns identity mapping when folds exist but none are folded', () => {
			const folds: FoldRange[] = [
				{ startLine: 2, endLine: 5, type: 'function' },
			]
			runWithMapping(
				{ totalLines: 10, folds, foldedStarts: new Set() },
				(mapping) => {
					expect(mapping.visibleCount()).toBe(10)
					expect(mapping.displayToLine(3)).toBe(3)
					expect(mapping.lineToDisplay(3)).toBe(3)
					expect(mapping.isLineHidden(3)).toBe(false)
				}
			)
		})
	})

	describe('single fold', () => {
		it('hides lines inside a folded region', () => {
			// Fold from line 2 to line 5: lines 3,4 are hidden (line 2 is header, line 5 is closing bracket)
			const folds: FoldRange[] = [
				{ startLine: 2, endLine: 5, type: 'function' },
			]
			runWithMapping(
				{ totalLines: 10, folds, foldedStarts: new Set([2]) },
				(mapping) => {
					// 10 total - 2 hidden (lines 3,4) = 8 visible
					expect(mapping.visibleCount()).toBe(8)

					// Line 2 (fold header) is visible
					expect(mapping.isLineHidden(2)).toBe(false)
					expect(mapping.isFoldHeader(2)).toBe(true)

					// Lines 3,4 are hidden
					expect(mapping.isLineHidden(3)).toBe(true)
					expect(mapping.isLineHidden(4)).toBe(true)

					// Line 5 (closing bracket) stays visible
					expect(mapping.isLineHidden(5)).toBe(false)

					// Line 6 is visible
					expect(mapping.isLineHidden(6)).toBe(false)
				}
			)
		})

		it('correctly maps display indices to line indices', () => {
			// Lines: 0,1,2,[3,4 hidden],5,6,7,8,9
			// Display: 0,1,2,3,4,5,6,7 -> Lines: 0,1,2,5,6,7,8,9
			const folds: FoldRange[] = [
				{ startLine: 2, endLine: 5, type: 'function' },
			]
			runWithMapping(
				{ totalLines: 10, folds, foldedStarts: new Set([2]) },
				(mapping) => {
					expect(mapping.displayToLine(0)).toBe(0)
					expect(mapping.displayToLine(1)).toBe(1)
					expect(mapping.displayToLine(2)).toBe(2) // fold header
					expect(mapping.displayToLine(3)).toBe(5) // closing bracket (endLine stays visible)
					expect(mapping.displayToLine(4)).toBe(6)
					expect(mapping.displayToLine(5)).toBe(7)
					expect(mapping.displayToLine(6)).toBe(8)
					expect(mapping.displayToLine(7)).toBe(9)
				}
			)
		})

		it('correctly maps line indices to display indices', () => {
			const folds: FoldRange[] = [
				{ startLine: 2, endLine: 5, type: 'function' },
			]
			runWithMapping(
				{ totalLines: 10, folds, foldedStarts: new Set([2]) },
				(mapping) => {
					expect(mapping.lineToDisplay(0)).toBe(0)
					expect(mapping.lineToDisplay(1)).toBe(1)
					expect(mapping.lineToDisplay(2)).toBe(2)
					expect(mapping.lineToDisplay(3)).toBe(-1) // hidden
					expect(mapping.lineToDisplay(4)).toBe(-1) // hidden
					expect(mapping.lineToDisplay(5)).toBe(3) // closing bracket visible
					expect(mapping.lineToDisplay(6)).toBe(4)
					expect(mapping.lineToDisplay(7)).toBe(5)
				}
			)
		})
	})

	describe('multiple non-overlapping folds', () => {
		it('handles multiple separate folded regions', () => {
			// Two folds: [2-4] and [7-9]
			// Hidden: 3 and 8 only (closing brackets 4 and 9 stay visible)
			const folds: FoldRange[] = [
				{ startLine: 2, endLine: 4, type: 'function' },
				{ startLine: 7, endLine: 9, type: 'function' },
			]
			runWithMapping(
				{ totalLines: 12, folds, foldedStarts: new Set([2, 7]) },
				(mapping) => {
					// 12 - 1 - 1 = 10 visible
					expect(mapping.visibleCount()).toBe(10)

					expect(mapping.isLineHidden(2)).toBe(false) // header
					expect(mapping.isLineHidden(3)).toBe(true)
					expect(mapping.isLineHidden(4)).toBe(false) // closing bracket
					expect(mapping.isLineHidden(5)).toBe(false)
					expect(mapping.isLineHidden(6)).toBe(false)
					expect(mapping.isLineHidden(7)).toBe(false) // header
					expect(mapping.isLineHidden(8)).toBe(true)
					expect(mapping.isLineHidden(9)).toBe(false) // closing bracket
					expect(mapping.isLineHidden(10)).toBe(false)
				}
			)
		})

		it('correctly maps display to line with multiple folds', () => {
			const folds: FoldRange[] = [
				{ startLine: 2, endLine: 4, type: 'function' },
				{ startLine: 7, endLine: 9, type: 'function' },
			]
			runWithMapping(
				{ totalLines: 12, folds, foldedStarts: new Set([2, 7]) },
				(mapping) => {
					// Display: 0,1,2,3,4,5,6,7,8,9 -> Lines: 0,1,2,4,5,6,7,9,10,11
					expect(mapping.displayToLine(0)).toBe(0)
					expect(mapping.displayToLine(1)).toBe(1)
					expect(mapping.displayToLine(2)).toBe(2) // header 1
					expect(mapping.displayToLine(3)).toBe(4) // closing bracket 1
					expect(mapping.displayToLine(4)).toBe(5)
					expect(mapping.displayToLine(5)).toBe(6)
					expect(mapping.displayToLine(6)).toBe(7) // header 2
					expect(mapping.displayToLine(7)).toBe(9) // closing bracket 2
					expect(mapping.displayToLine(8)).toBe(10)
					expect(mapping.displayToLine(9)).toBe(11)
				}
			)
		})
	})

	describe('nested folds', () => {
		it('handles nested folds where inner is already hidden by outer', () => {
			// Outer fold: 1-10, Inner fold: 3-5
			// When outer is folded, lines 2-9 are hidden (10 is closing bracket, stays visible)
			const folds: FoldRange[] = [
				{ startLine: 1, endLine: 10, type: 'class' },
				{ startLine: 3, endLine: 5, type: 'function' },
			]
			runWithMapping(
				{ totalLines: 15, folds, foldedStarts: new Set([1]) },
				(mapping) => {
					// Only outer is folded: lines 2-9 hidden (8 lines), line 10 is closing bracket
					// 15 - 8 = 7 visible
					expect(mapping.visibleCount()).toBe(7)

					expect(mapping.isLineHidden(1)).toBe(false) // outer header
					expect(mapping.isLineHidden(2)).toBe(true)
					expect(mapping.isLineHidden(3)).toBe(true) // would be inner header, but hidden by outer
					expect(mapping.isLineHidden(9)).toBe(true) // last hidden line
					expect(mapping.isLineHidden(10)).toBe(false) // closing bracket visible
					expect(mapping.isLineHidden(11)).toBe(false)
				}
			)
		})

		it('correctly merges overlapping fold regions', () => {
			// Two overlapping folds
			// Fold 1: startLine=2, endLine=6 -> hides 3-5 (6 is closing bracket)
			// Fold 2: startLine=4, endLine=8 -> hides 5-7 (8 is closing bracket)
			// Merged hidden range: 3-7 (5 lines hidden)
			const folds: FoldRange[] = [
				{ startLine: 2, endLine: 6, type: 'function' },
				{ startLine: 4, endLine: 8, type: 'function' },
			]
			runWithMapping(
				{ totalLines: 12, folds, foldedStarts: new Set([2, 4]) },
				(mapping) => {
					// 12 - 5 = 7 visible
					expect(mapping.visibleCount()).toBe(7)

					expect(mapping.isLineHidden(2)).toBe(false) // header 1
					expect(mapping.isLineHidden(3)).toBe(true)
					expect(mapping.isLineHidden(4)).toBe(true) // header 2 is also hidden by fold 1
					expect(mapping.isLineHidden(5)).toBe(true)
					expect(mapping.isLineHidden(6)).toBe(true)
					expect(mapping.isLineHidden(7)).toBe(true)
					expect(mapping.isLineHidden(8)).toBe(false) // closing bracket of fold 2
					expect(mapping.isLineHidden(9)).toBe(false)
				}
			)
		})
	})

	describe('edge cases', () => {
		it('handles fold at the start of document', () => {
			// Fold 0-3: hides 1,2 (3 is closing bracket)
			const folds: FoldRange[] = [{ startLine: 0, endLine: 3, type: 'imports' }]
			runWithMapping(
				{ totalLines: 10, folds, foldedStarts: new Set([0]) },
				(mapping) => {
					// Lines 1,2 hidden, line 0 is header, line 3 is closing bracket
					expect(mapping.visibleCount()).toBe(8)
					expect(mapping.isLineHidden(0)).toBe(false)
					expect(mapping.isLineHidden(1)).toBe(true)
					expect(mapping.isLineHidden(2)).toBe(true)
					expect(mapping.isLineHidden(3)).toBe(false) // closing bracket
					expect(mapping.displayToLine(0)).toBe(0)
					expect(mapping.displayToLine(1)).toBe(3) // closing bracket
					expect(mapping.displayToLine(2)).toBe(4)
				}
			)
		})

		it('handles fold at the end of document', () => {
			// Fold 7-9: hides line 8 only (9 is closing bracket)
			const folds: FoldRange[] = [
				{ startLine: 7, endLine: 9, type: 'function' },
			]
			runWithMapping(
				{ totalLines: 10, folds, foldedStarts: new Set([7]) },
				(mapping) => {
					// Line 8 hidden, 9 is closing bracket
					expect(mapping.visibleCount()).toBe(9)
					expect(mapping.displayToLine(7)).toBe(7) // fold header
					expect(mapping.displayToLine(8)).toBe(9) // closing bracket
				}
			)
		})

		it('handles empty document', () => {
			runWithMapping({ totalLines: 0, folds: [] }, (mapping) => {
				expect(mapping.visibleCount()).toBe(0)
			})
		})

		it('handles fold that spans single line (startLine == endLine)', () => {
			// This shouldn't hide anything
			const folds: FoldRange[] = [
				{ startLine: 5, endLine: 5, type: 'statement' },
			]
			runWithMapping(
				{ totalLines: 10, folds, foldedStarts: new Set([5]) },
				(mapping) => {
					// No lines hidden (endLine must be > startLine to hide)
					expect(mapping.visibleCount()).toBe(10)
				}
			)
		})

		it('handles folding entire document except first and last line', () => {
			// Fold 0-99: hides 1-98, lines 0 and 99 visible
			const folds: FoldRange[] = [{ startLine: 0, endLine: 99, type: 'all' }]
			runWithMapping(
				{ totalLines: 100, folds, foldedStarts: new Set([0]) },
				(mapping) => {
					// Lines 0 (header) and 99 (closing bracket) visible
					expect(mapping.visibleCount()).toBe(2)
					expect(mapping.displayToLine(0)).toBe(0)
					expect(mapping.displayToLine(1)).toBe(99)
				}
			)
		})
	})

	describe('reactivity', () => {
		it('updates when foldedStarts changes', () => {
			createRoot((dispose) => {
				const folds: FoldRange[] = [
					{ startLine: 2, endLine: 5, type: 'function' },
				]
				const [foldedStarts, setFoldedStarts] = createSignal<Set<number>>(
					new Set<number>()
				)

				const mapping = createFoldMapping({
					totalLines: () => 10,
					folds: () => folds,
					foldedStarts,
				})

				// Initially no folds
				expect(mapping.visibleCount()).toBe(10)

				// Update the signal and verify the mapping updates
				setFoldedStarts(new Set([2]))
				expect(mapping.visibleCount()).toBe(8)

				// Verify unfold
				setFoldedStarts(new Set<number>())
				expect(mapping.visibleCount()).toBe(10)

				dispose()
			})
		})
	})
})
