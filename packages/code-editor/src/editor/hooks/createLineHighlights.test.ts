/* eslint-disable solid/reactivity */
import { describe, expect, it } from 'vitest'
import { createRoot, createSignal } from 'solid-js'
import type { HighlightOffsets } from '../types'
import { createLineHighlights } from './createLineHighlights'

const makeEntry = (
	index: number,
	start: number,
	length: number,
	text: string,
	lineId = index + 1
) => ({
	lineId,
	index,
	start,
	length,
	text,
})

const defaultLineProps = {
	lineCount: () => 1000,
	getLineStart: (i: number) => 0,
	getLineLength: (i: number) => 100,
	getLineTextLength: (i: number) => 100,
}

describe('createLineHighlights', () => {
	it('invalidates cached line highlights when line text changes', () => {
		createRoot((dispose) => {
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 5, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				highlights,
			})

			const entryA = makeEntry(0, 0, 5, 'hello')
			const segmentsA = getLineHighlights(entryA)
			expect(segmentsA.length).toBeGreaterThan(0)

			const segmentsA2 = getLineHighlights(entryA)
			expect(segmentsA2).toBe(segmentsA)

			const entryB = makeEntry(0, 0, 5, 'world')
			const segmentsB = getLineHighlights(entryB)
			expect(segmentsB.length).toBeGreaterThan(0)

			const segmentsB2 = getLineHighlights(entryB)
			expect(segmentsB2).toBe(segmentsB)

			dispose()
		})
	})

	it('keeps precomputed highlights for unaffected lines when offsets are applied', () => {
		createRoot((dispose) => {
			const [highlightOffset, setHighlightOffset] =
				createSignal<HighlightOffsets>([])
			const [highlights] = createSignal([
				{ startIndex: 6, endIndex: 11, scope: 'variable' },
			])
			const [lineEntries, setLineEntries] = createSignal([
				makeEntry(0, 0, 5, 'hello'),
				makeEntry(1, 6, 5, 'world'),
			])
			const { getLineHighlights } = createLineHighlights({
				lineCount: () => 2,
				getLineStart: (i: number) => (i === 0 ? 0 : 6),
				getLineLength: (i: number) => (i === 0 ? 6 : 5),
				getLineTextLength: (i: number) => (i === 0 ? 5 : 5),
				highlights,
				highlightOffset,
			})

			const before = getLineHighlights(lineEntries()[1]!)
			expect(before.length).toBeGreaterThan(0)

			setHighlightOffset([
				{
					charDelta: 1,
					lineDelta: 0,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 0,
					newEndIndex: 1,
				},
			])
			setLineEntries([
				makeEntry(0, 0, 6, 'xhello'),
				makeEntry(1, 7, 5, 'world'),
			])

			const after = getLineHighlights(lineEntries()[1]!)
			expect(after).toBe(before)

			dispose()
		})
	})

	it('recomputes highlights when highlight offset changes within a line', () => {
		createRoot((dispose) => {
			const [highlightOffset, setHighlightOffset] = createSignal([
				{
					charDelta: 0,
					lineDelta: 0,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 0,
					newEndIndex: 0,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 3, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 0, 6, 'abcdef')
			const segments = getLineHighlights(entry)
			expect(segments[0]?.start).toBe(0)

			const cached = getLineHighlights(entry)
			expect(cached).toBe(segments)

			setHighlightOffset([
				{
					charDelta: 2,
					lineDelta: 0,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 0,
					newEndIndex: 2,
				},
			])

			const shiftedEntry = {
				lineId: 1,
				index: 0,
				start: 0,
				length: 8,
				text: 'xxabcdef',
			}
			const shifted = getLineHighlights(shiftedEntry)
			expect(shifted).not.toBe(cached)
			expect(shifted[0]?.start).toBe(2)

			dispose()
		})
	})

	it('reuses cached highlights when offsets shift a later line', () => {
		createRoot((dispose) => {
			const [highlightOffset, setHighlightOffset] =
				createSignal<HighlightOffsets>([])
			const [highlights] = createSignal([
				{ startIndex: 10, endIndex: 12, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				lineCount: () => 2,
				getLineStart: (i: number) => (i === 0 ? 0 : 10),
				getLineLength: (i: number) => (i === 0 ? 10 : 4),
				getLineTextLength: (i: number) => 4,
				highlights,
				highlightOffset,
			})

			const entryBefore = makeEntry(1, 10, 4, 'abcd')
			const segments = getLineHighlights(entryBefore)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })

			setHighlightOffset([
				{
					charDelta: 2,
					lineDelta: 0,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 0,
					newEndIndex: 2,
				},
			])

			const entryAfter = makeEntry(1, 12, 4, 'abcd')
			const shifted = getLineHighlights(entryAfter)
			expect(shifted).toBe(segments)
			expect(shifted[0]).toMatchObject({ start: 0, end: 2 })

			dispose()
		})
	})

	it('reuses cached highlights after line delta shifts', () => {
		createRoot((dispose) => {
			const [highlightOffset, setHighlightOffset] =
				createSignal<HighlightOffsets>([])
			const [highlights] = createSignal([
				{ startIndex: 10, endIndex: 12, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				lineCount: () => 4,
				getLineStart: (i: number) => i * 5,
				getLineLength: () => 5,
				getLineTextLength: () => 4,
				highlights,
				highlightOffset,
			})

			const entryBefore = makeEntry(2, 10, 4, 'wxyz', 42)
			const segments = getLineHighlights(entryBefore)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })

			setHighlightOffset([
				{
					charDelta: 1,
					lineDelta: 1,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 1,
					oldEndIndex: 0,
					newEndIndex: 1,
				},
			])

			const entryAfter = makeEntry(3, 11, 4, 'wxyz', 42)
			const shifted = getLineHighlights(entryAfter)
			expect(shifted).toBe(segments)
			expect(shifted[0]).toMatchObject({ start: 0, end: 2 })

			dispose()
		})
	})

	it('splits highlights when insert offset crosses a highlight', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: 2,
					lineDelta: 0,
					fromCharIndex: 2,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 2,
					newEndIndex: 4,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 5, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 0, 7, 'ab12cde')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(2)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })
			expect(segments[1]).toMatchObject({ start: 4, end: 7 })

			dispose()
		})
	})

	it('shifts highlights after insert within the same line', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: 3,
					lineDelta: 0,
					fromCharIndex: 2,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 2,
					newEndIndex: 5,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 4, endIndex: 6, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 0, 9, 'abXYZcdef')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(1)
			expect(segments[0]).toMatchObject({ start: 7, end: 9 })

			dispose()
		})
	})

	it('shifts highlights after deletion within the same line', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: -2,
					lineDelta: 0,
					fromCharIndex: 2,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 4,
					newEndIndex: 2,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 5, endIndex: 7, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 0, 5, 'abefg')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(1)
			expect(segments[0]).toMatchObject({ start: 3, end: 5 })

			dispose()
		})
	})

	it('applies multiple offsets in order', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: 2,
					lineDelta: 0,
					fromCharIndex: 2,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 2,
					newEndIndex: 4,
				},
				{
					charDelta: -1,
					lineDelta: 0,
					fromCharIndex: 5,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 6,
					newEndIndex: 5,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 6, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 0, 7, 'abXYcef')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(2)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })
			expect(segments[1]).toMatchObject({ start: 4, end: 7 })

			dispose()
		})
	})

	// This test checks edge case behavior where an edit occurred before
	// the line but we still need to find highlights.
	it('keeps highlights on lines after insert offsets', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: 5,
					lineDelta: 0,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 0,
					newEndIndex: 5,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 5, endIndex: 7, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				getLineStart: () => 10,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 10, 4, 'abcd')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(1)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })

			dispose()
		})
	})

	// This test checks edge case behavior where a deletion occurred before
	// the line but we still need to find highlights.
	it('keeps highlights on lines after deletion offsets', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: -5,
					lineDelta: 0,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 5,
					newEndIndex: 0,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 10, endIndex: 12, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				getLineStart: () => 5,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 5, 4, 'abcd')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(1)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })

			dispose()
		})
	})

	it('drops highlights fully removed by deletion', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: -2,
					lineDelta: 0,
					fromCharIndex: 2,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 4,
					newEndIndex: 2,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 2, endIndex: 4, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 0, 4, 'abef')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(0)

			dispose()
		})
	})

	it('truncates highlights that end inside a deletion range', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: -2,
					lineDelta: 0,
					fromCharIndex: 2,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 4,
					newEndIndex: 2,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 3, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 0, 4, 'abef')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(1)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })

			dispose()
		})
	})

	it('shifts error highlights on deletion', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: -1,
					lineDelta: 0,
					fromCharIndex: 4,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 5,
					newEndIndex: 4,
				},
			])
			const [errors] = createSignal([
				{ startIndex: 0, endIndex: 5, message: 'err', isMissing: false },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				errors,
				highlightOffset,
			})

			const entry = makeEntry(0, 0, 4, 'cons')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(1)
			expect(segments[0]).toMatchObject({ start: 0, end: 4 })

			dispose()
		})
	})

	it('splits highlights on same-length replacements', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: 0,
					lineDelta: 0,
					fromCharIndex: 2,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 4,
					newEndIndex: 4,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 5, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				highlights,
				highlightOffset,
			})

			const entry = makeEntry(0, 0, 5, 'abXYe')
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(2)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })
			expect(segments[1]).toMatchObject({ start: 4, end: 5 })

			dispose()
		})
	})

	it('handles large number of highlights using spatial index', () => {
		createRoot((dispose) => {
			// Generate many highlights properly sorted
			const largeHighlights = Array.from({ length: 5000 }, (_, i) => ({
				startIndex: i * 10,
				endIndex: i * 10 + 5,
				scope: 'variable',
			}))

			const [highlights] = createSignal(largeHighlights)

			const { getLineHighlights } = createLineHighlights({
				...defaultLineProps,
				getLineStart: () => 25000,
				highlights,
			})

			// Test a line in the middle
			// Line corresponds to index 2500 -> start char 25000
			const entry = makeEntry(0, 25000, 100, ' '.repeat(100))
			const segments = getLineHighlights(entry)

			// Should return highlights falling in range [25000, 25100]
			// i=2500 -> 25000-25005 (in range)
			// i=2501 -> 25010-25015 (in range)
			// ...
			// i=2510 -> 25100-25105 (touching end)

			expect(segments.length).toBeGreaterThan(0)

			const firstSegment = segments[0]
			expect(firstSegment).toBeDefined()
			expect(firstSegment!.scope).toBe('variable')

			dispose()
		})
	})
})
