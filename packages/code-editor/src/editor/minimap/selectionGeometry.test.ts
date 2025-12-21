import { describe, expect, it } from 'vitest'
import { computeMinimapSelectionRects } from './selectionGeometry'

const getLineTextLength =
	(lengths: number[]) =>
	(line: number): number =>
		lengths[line] ?? 0

describe('computeMinimapSelectionRects', () => {
	const metrics = {
		rowHeight: 2,
		charWidth: 1,
		scrollOffset: 0,
		deviceHeight: 20,
		maxChars: 80,
		xOffset: 1,
		clipWidth: 100,
	}

	it('maps a single-line selection to a narrow rect', () => {
		const rects = computeMinimapSelectionRects(
			{
				startLine: 2,
				startColumn: 3,
				endLine: 2,
				endColumn: 4,
			},
			getLineTextLength([5, 5, 10]),
			metrics
		)

		expect(rects).toEqual([
			{
				line: 2,
				x: 1 + 3,
				y: 2 * 2,
				width: 1,
				height: 2,
			},
		])
	})

	it('splits multi-line selections into per-line rectangles', () => {
		const rects = computeMinimapSelectionRects(
			{
				startLine: 0,
				startColumn: 2,
				endLine: 2,
				endColumn: 3,
			},
			getLineTextLength([5, 4, 6]),
			metrics
		)

		expect(rects).toEqual([
			{
				line: 0,
				x: 1 + 2,
				y: 0,
				width: 3,
				height: 2,
			},
			{
				line: 1,
				x: 1,
				y: 2,
				width: 4,
				height: 2,
			},
			{
				line: 2,
				x: 1,
				y: 4,
				width: 3,
				height: 2,
			},
		])
	})

	it('clamps selection width to max chars', () => {
		const rects = computeMinimapSelectionRects(
			{
				startLine: 0,
				startColumn: 2,
				endLine: 0,
				endColumn: 8,
			},
			getLineTextLength([20]),
			{
				...metrics,
				maxChars: 4,
			}
		)

		expect(rects).toEqual([
			{
				line: 0,
				x: 1 + 2,
				y: 0,
				width: 2,
				height: 2,
			},
		])
	})

	it('skips lines outside the visible range', () => {
		const rects = computeMinimapSelectionRects(
			{
				startLine: 1,
				startColumn: 0,
				endLine: 2,
				endColumn: 4,
			},
			getLineTextLength([5, 5, 5]),
			{
				...metrics,
				deviceHeight: 2,
				scrollOffset: 2,
			}
		)

		expect(rects).toEqual([
			{
				line: 1,
				x: 1,
				y: 0,
				width: 5,
				height: 2,
			},
		])
	})
})
