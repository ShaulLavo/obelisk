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
			const [highlightOffset, setHighlightOffset] = createSignal({
				charDelta: 0,
				lineDelta: 0,
				fromCharIndex: 0,
				fromLineRow: 0,
			})
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

			setHighlightOffset({
				charDelta: 2,
				lineDelta: 0,
				fromCharIndex: 0,
				fromLineRow: 0,
			})

			const shifted = getLineHighlights(entry)
			expect(shifted).not.toBe(cached)
			expect(shifted[0]?.start).toBe(2)

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
