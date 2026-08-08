import { describe, it, expect } from 'vitest'
import {
	tabAdvance,
	charIndexToVisualColumn,
	visualColumnToCharIndex,
	columnToX,
	xToColumn,
	lineFromClientY,
	computeVisibleRange,
	computePoolSize,
} from './domMetrics'

const metrics = { charWidth: 8, lineHeight: 18, tabSize: 4, overscanLines: 10 }

describe('domMetrics', () => {
	describe('tabAdvance', () => {
		it('advances to next tab stop', () => {
			expect(tabAdvance(0, 4)).toBe(4)
			expect(tabAdvance(1, 4)).toBe(3)
			expect(tabAdvance(2, 4)).toBe(2)
			expect(tabAdvance(3, 4)).toBe(1)
			expect(tabAdvance(4, 4)).toBe(4)
		})
	})

	describe('charIndexToVisualColumn', () => {
		it('no tabs — column equals char index', () => {
			expect(charIndexToVisualColumn('hello', 3, 4)).toBe(3)
		})

		it('tabs expand to tab stops', () => {
			// \tHello — tab at column 0 spans 4, so 'H' is at visual column 4
			expect(charIndexToVisualColumn('\tHello', 1, 4)).toBe(4)
			expect(charIndexToVisualColumn('\tHello', 2, 4)).toBe(5)
		})

		it('multiple tabs', () => {
			// \t\t — first tab: 0→4, second tab: 4→8
			expect(charIndexToVisualColumn('\t\t', 2, 4)).toBe(8)
		})

		it('tab after some text', () => {
			// ab\t — 'a'=0, 'b'=1, tab at column 2 advances to 4
			expect(charIndexToVisualColumn('ab\t', 3, 4)).toBe(4)
		})
	})

	describe('visualColumnToCharIndex', () => {
		it('no tabs — simple mapping', () => {
			expect(visualColumnToCharIndex('hello', 3, 4)).toBe(3)
		})

		it('maps visual column to char past tab', () => {
			expect(visualColumnToCharIndex('\tHello', 4, 4)).toBe(1)
		})

		it('clamps to text length', () => {
			expect(visualColumnToCharIndex('hi', 10, 4)).toBe(2)
		})
	})

	describe('columnToX / xToColumn', () => {
		it('plain text round trips', () => {
			const x = columnToX('hello', 3, metrics)
			expect(x).toBe(24) // 3 * 8
			expect(xToColumn('hello', x, metrics)).toBe(3)
		})

		it('tab-aware measurement', () => {
			const x = columnToX('\tHello', 1, metrics) // tab at 0 → visual col 4
			expect(x).toBe(32) // 4 * 8
		})
	})

	describe('lineFromClientY', () => {
		it('maps y to line index', () => {
			expect(lineFromClientY(36, 0, 0, 18, 100)).toBe(2) // 36 / 18 = 2
		})

		it('clamps to valid range', () => {
			expect(lineFromClientY(-10, 0, 0, 18, 100)).toBe(0)
			expect(lineFromClientY(9999, 0, 0, 18, 10)).toBe(9)
		})

		it('accounts for scroll offset', () => {
			expect(lineFromClientY(0, 0, 36, 18, 100)).toBe(2) // scrollTop=36
		})

		/*
		 * `contentTop` must be a reference that does NOT move when the editor
		 * scrolls — i.e. the scroll container, not the content inside it. Passing
		 * the inner content's rect counts the scroll twice, because that rect
		 * already includes it, and the caret then lands N lines off wherever the
		 * user has scrolled to. This reads correctly at scrollTop 0, which is why
		 * it hides from any test that only clicks at the top of a file.
		 */
		it('uses a scroll-independent reference top', () => {
			const lineHeight = 20
			const containerTop = 100
			const scrollTop = 400 // 20 lines down
			const clientY = containerTop + 10 // first visible line

			expect(
				lineFromClientY(clientY, containerTop, scrollTop, lineHeight, 200)
			).toBe(20)

			// The inner content has moved up by scrollTop; using its top double-counts.
			const movedContentTop = containerTop - scrollTop
			expect(
				lineFromClientY(clientY, movedContentTop, scrollTop, lineHeight, 200)
			).toBe(40)
		})
	})

	describe('computeVisibleRange', () => {
		it('computes range with overscan', () => {
			const range = computeVisibleRange(0, 360, 18, 1000, 10) // 20 visible lines
			expect(range.startLine).toBe(0)
			expect(range.endLine).toBe(30) // 20 visible + 10 overscan below
		})

		it('clamps to line count', () => {
			const range = computeVisibleRange(0, 360, 18, 5, 10)
			expect(range.endLine).toBe(5)
		})

		it('handles scrolled position', () => {
			const range = computeVisibleRange(180, 360, 18, 1000, 10)
			// First visible = 10, last visible = 30
			expect(range.startLine).toBe(0) // 10 - 10 overscan = 0
			expect(range.endLine).toBe(40) // 30 + 10 overscan
		})

		it('handles empty document', () => {
			const range = computeVisibleRange(0, 360, 18, 0, 10)
			expect(range.startLine).toBe(0)
			expect(range.endLine).toBe(0)
		})
	})

	describe('computePoolSize', () => {
		it('computes pool with overscan', () => {
			const result = computePoolSize(360, 18)
			expect(result.visibleRows).toBe(20)
			expect(result.overscanRows).toBe(10) // ceil(20/2) = 10
			expect(result.poolSize).toBe(40) // 20 + 2*10 = 40
		})

		it('caps pool at 200', () => {
			const result = computePoolSize(3600, 18) // 200 visible rows
			expect(result.poolSize).toBeLessThanOrEqual(200)
		})

		it('handles zero viewport', () => {
			const result = computePoolSize(0, 18)
			expect(result.visibleRows).toBe(0)
			expect(result.poolSize).toBe(16) // 0 + 2*8 min overscan
		})
	})
})
