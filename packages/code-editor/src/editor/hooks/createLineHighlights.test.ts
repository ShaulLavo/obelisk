import { describe, expect, it } from 'vitest'
import { createRoot, createSignal } from 'solid-js'
import { createLineHighlights } from './createLineHighlights'

describe('createLineHighlights', () => {
	it('invalidates cached line highlights when line text changes', () => {
		createRoot((dispose) => {
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 5, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({ highlights })

			const entryA = { index: 0, start: 0, length: 5, text: 'hello' }
			const segmentsA = getLineHighlights(entryA)
			expect(segmentsA.length).toBeGreaterThan(0)

			const segmentsA2 = getLineHighlights(entryA)
			expect(segmentsA2).toBe(segmentsA)

			const entryB = { index: 0, start: 0, length: 5, text: 'world' }
			const segmentsB = getLineHighlights(entryB)
			expect(segmentsB.length).toBeGreaterThan(0)

			const segmentsB2 = getLineHighlights(entryB)
			expect(segmentsB2).toBe(segmentsB)

			dispose()
		})
	})

	it('recomputes highlights when highlight offset changes', () => {
		createRoot((dispose) => {
			const [highlightOffset, setHighlightOffset] = createSignal([
				{
				charDelta: 0,
				lineDelta: 0,
				fromCharIndex: 0,
				fromLineRow: 0,
				oldEndIndex: 0,
				newEndIndex: 0,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 3, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 0, length: 6, text: 'abcdef' }
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
				oldEndIndex: 0,
				newEndIndex: 2,
				},
			])

			const shifted = getLineHighlights(entry)
			expect(shifted).not.toBe(cached)
			expect(shifted[0]?.start).toBe(2)

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
				oldEndIndex: 2,
				newEndIndex: 4,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 5, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 0, length: 7, text: 'ab12cde' }
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
				oldEndIndex: 2,
				newEndIndex: 5,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 4, endIndex: 6, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 0, length: 9, text: 'abXYZcdef' }
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
				oldEndIndex: 4,
				newEndIndex: 2,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 5, endIndex: 7, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 0, length: 5, text: 'abefg' }
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
					oldEndIndex: 2,
					newEndIndex: 4,
				},
				{
					charDelta: -1,
					lineDelta: 0,
					fromCharIndex: 5,
					fromLineRow: 0,
					oldEndIndex: 6,
					newEndIndex: 5,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 6, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 0, length: 7, text: 'abXYcef' }
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(2)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })
			expect(segments[1]).toMatchObject({ start: 4, end: 7 })

			dispose()
		})
	})

	it('keeps highlights on lines after insert offsets', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: 5,
					lineDelta: 0,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndIndex: 0,
					newEndIndex: 5,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 5, endIndex: 7, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 10, length: 4, text: 'abcd' }
			const segments = getLineHighlights(entry)

			expect(segments).toHaveLength(1)
			expect(segments[0]).toMatchObject({ start: 0, end: 2 })

			dispose()
		})
	})

	it('keeps highlights on lines after deletion offsets', () => {
		createRoot((dispose) => {
			const [highlightOffset] = createSignal([
				{
					charDelta: -5,
					lineDelta: 0,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndIndex: 5,
					newEndIndex: 0,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 10, endIndex: 12, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 5, length: 4, text: 'abcd' }
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
					oldEndIndex: 4,
					newEndIndex: 2,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 2, endIndex: 4, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 0, length: 4, text: 'abef' }
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
					oldEndIndex: 4,
					newEndIndex: 2,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 3, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 0, length: 4, text: 'abef' }
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
					oldEndIndex: 5,
					newEndIndex: 4,
				},
			])
			const [errors] = createSignal([
				{ startIndex: 0, endIndex: 5, message: 'err', isMissing: false },
			])
			const { getLineHighlights } = createLineHighlights({
				errors,
				highlightOffset,
			})

			const entry = { index: 0, start: 0, length: 4, text: 'cons' }
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
					oldEndIndex: 4,
					newEndIndex: 4,
				},
			])
			const [highlights] = createSignal([
				{ startIndex: 0, endIndex: 5, scope: 'variable' },
			])
			const { getLineHighlights } = createLineHighlights({
				highlights,
				highlightOffset,
			})

			const entry = { index: 0, start: 0, length: 5, text: 'abXYe' }
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
				highlights,
			})

			// Test a line in the middle
			// Line corresponds to index 2500 -> start char 25000
			const entry = {
				index: 0,
				start: 25000,
				length: 100,
				text: ' '.repeat(100),
			}
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
