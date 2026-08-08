import { describe, it, expect } from 'vitest'
import {
	isLongLine,
	LONG_LINE_RENDER_THRESHOLD,
	computeLongLineSlice,
	renderLongLineSlice,
} from './LongLineRenderer'

// ---------------------------------------------------------------------------
// isLongLine — threshold behavior
// ---------------------------------------------------------------------------

describe('isLongLine', () => {
	it('returns false for lines at the threshold', () => {
		expect(isLongLine(LONG_LINE_RENDER_THRESHOLD)).toBe(false)
	})

	it('returns false for lines below the threshold', () => {
		expect(isLongLine(100)).toBe(false)
		expect(isLongLine(0)).toBe(false)
		expect(isLongLine(LONG_LINE_RENDER_THRESHOLD - 1)).toBe(false)
	})

	it('returns true for lines above the threshold', () => {
		expect(isLongLine(LONG_LINE_RENDER_THRESHOLD + 1)).toBe(true)
		expect(isLongLine(10000)).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// computeLongLineSlice
// ---------------------------------------------------------------------------

describe('computeLongLineSlice', () => {
	const charWidth = 8
	const tabSize = 4

	it('slices around the visible viewport', () => {
		const lineText = 'a'.repeat(10000)
		const scrollLeft = 800 // char 100
		const viewportWidth = 400 // ~50 chars

		const slice = computeLongLineSlice(lineText, scrollLeft, viewportWidth, charWidth, tabSize)

		// firstVisibleChar = max(0, floor(800/8) - 100) = 0
		// lastVisibleChar = min(10000, ceil((800+400)/8) + 100) = 250
		expect(slice.startChar).toBe(0)
		expect(slice.endChar).toBe(250)
		expect(slice.text).toBe('a'.repeat(250))
	})

	it('handles scrolled position with padding', () => {
		const lineText = 'b'.repeat(10000)
		const scrollLeft = 4000 // char 500
		const viewportWidth = 800 // ~100 chars

		const slice = computeLongLineSlice(lineText, scrollLeft, viewportWidth, charWidth, tabSize)

		// firstVisibleChar = max(0, floor(4000/8) - 100) = 400
		// lastVisibleChar = min(10000, ceil((4000+800)/8) + 100) = 700
		expect(slice.startChar).toBe(400)
		expect(slice.endChar).toBe(700)
		expect(slice.text.length).toBe(300)
	})

	it('clamps to line boundaries', () => {
		const lineText = 'c'.repeat(10000)
		const scrollLeft = 0
		const viewportWidth = 800

		const slice = computeLongLineSlice(lineText, scrollLeft, viewportWidth, charWidth, tabSize)

		expect(slice.startChar).toBe(0)
		expect(slice.text.length).toBeGreaterThan(0)
		expect(slice.endChar).toBeLessThanOrEqual(lineText.length)
	})

	it('computes tab-aware offsetX', () => {
		// Line starts with a tab (4 cols wide), then normal chars
		const lineText = '\t' + 'x'.repeat(10000)
		const scrollLeft = 4000
		const viewportWidth = 800

		const slice = computeLongLineSlice(lineText, scrollLeft, viewportWidth, charWidth, tabSize)

		// The offset should account for the tab's visual width
		expect(slice.offsetX).toBeGreaterThan(0)
	})

	it('returns correct offsetX for plain text', () => {
		const lineText = 'a'.repeat(10000)
		const scrollLeft = 4000
		const viewportWidth = 800

		const slice = computeLongLineSlice(lineText, scrollLeft, viewportWidth, charWidth, tabSize)

		// firstVisibleChar = floor(4000/8) - 100 = 400
		// offsetX = 400 * 8 = 3200
		expect(slice.offsetX).toBe(400 * charWidth)
	})
})

// ---------------------------------------------------------------------------
// renderLongLineSlice
// ---------------------------------------------------------------------------

describe('renderLongLineSlice', () => {
	it('sets textContent and transform on element', () => {
		const element = {
			textContent: '',
			style: { transform: '' },
		} as unknown as HTMLElement

		renderLongLineSlice(element, {
			startChar: 100,
			endChar: 300,
			text: 'hello world',
			offsetX: 800,
		})

		expect(element.textContent).toBe('hello world')
		expect(element.style.transform).toBe('translateX(800px)')
	})
})
