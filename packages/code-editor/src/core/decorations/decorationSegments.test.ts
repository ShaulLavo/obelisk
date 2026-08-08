import { describe, it, expect } from 'vitest'
import { absoluteToPerLine } from './decorationSegments'

describe('absoluteToPerLine', () => {
	const lineStarts = [0, 6, 12] // "hello\nworld\nfoo"
	const lineIds = [10, 20, 30]

	it('converts single-line range to per-line segment', () => {
		const result = absoluteToPerLine(
			[{ start: 0, end: 5, className: 'kw', scope: 'keyword' }],
			lineStarts,
			lineIds
		)
		expect(result.get(10)).toEqual([{ start: 0, end: 5, className: 'kw', scope: 'keyword' }])
		expect(result.has(20)).toBe(false)
	})

	it('splits range spanning multiple lines', () => {
		const result = absoluteToPerLine(
			[{ start: 3, end: 14, className: 'c', scope: 'comment' }],
			lineStarts,
			lineIds
		)
		// Line 0: offset 3 to 6 (end of line)
		expect(result.get(10)).toEqual([{ start: 3, end: 6, className: 'c', scope: 'comment' }])
		// Line 1: offset 0 to 6 (full line)
		expect(result.get(20)).toEqual([{ start: 0, end: 6, className: 'c', scope: 'comment' }])
		// Line 2: offset 0 to 2
		expect(result.get(30)).toEqual([{ start: 0, end: 2, className: 'c', scope: 'comment' }])
	})

	it('handles empty ranges', () => {
		const result = absoluteToPerLine([], lineStarts, lineIds)
		expect(result.size).toBe(0)
	})

	it('handles range with zero length', () => {
		const result = absoluteToPerLine(
			[{ start: 5, end: 5, className: 'x', scope: 'x' }],
			lineStarts,
			lineIds
		)
		expect(result.size).toBe(0)
	})

	it('handles multiple ranges on same line', () => {
		const result = absoluteToPerLine(
			[
				{ start: 0, end: 3, className: 'a', scope: 'a' },
				{ start: 3, end: 5, className: 'b', scope: 'b' },
			],
			lineStarts,
			lineIds
		)
		expect(result.get(10)!.length).toBe(2)
	})
})
