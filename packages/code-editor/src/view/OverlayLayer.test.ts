// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createOverlayLayer, updateSelection } from './OverlayLayer'
import type { EditorCore, SelectionRange } from '../core/types'

const metrics = { charWidth: 8, lineHeight: 18, tabSize: 4, overscanLines: 10 }

/** Minimal core stub exposing only what updateSelection reads. */
const makeCore = (lines: string[], selections: SelectionRange[]): EditorCore => {
	const lineStarts: number[] = []
	let offset = 0
	for (const line of lines) {
		lineStarts.push(offset)
		offset += line.length + 1
	}
	return {
		getSelections: () => selections,
		getLineText: (i: number) => lines[i] ?? '',
		getSnapshot: () => ({ document: { lineStarts } }),
	} as unknown as EditorCore
}

describe('updateSelection', () => {
	const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`)

	it('renders a rect per visible selected line', () => {
		const parent = document.createElement('div')
		const layer = createOverlayLayer(parent)
		// Select across lines 1-2, viewport covers lines 0-10.
		const core = makeCore(lines, [{ anchor: 7, focus: 20 }])

		expect(updateSelection(layer, core, metrics, 0, 0, 10)).toBe(true)
		const visible = layer.selectionEls.filter((e) => e.style.display !== 'none')
		expect(visible.length).toBeGreaterThan(0)
	})

	/*
	 * A selection scrolled entirely out of view made rectCount negative, so the
	 * hide-excess loop started at a negative index and dereferenced undefined.
	 * That threw inside the frame flush, which stopped the editor repainting —
	 * no caret, no selection, every frame.
	 */
	it('does not throw when the selection is entirely above the viewport', () => {
		const parent = document.createElement('div')
		const layer = createOverlayLayer(parent)
		const core = makeCore(lines, [{ anchor: 0, focus: 12 }])

		expect(() => updateSelection(layer, core, metrics, 0, 30, 40)).not.toThrow()
	})

	it('does not throw when the selection is entirely below the viewport', () => {
		const parent = document.createElement('div')
		const layer = createOverlayLayer(parent)
		const lineStart = lines.slice(0, 40).join('\n').length
		const core = makeCore(lines, [
			{ anchor: lineStart, focus: lineStart + 5 },
		])

		expect(() => updateSelection(layer, core, metrics, 0, 0, 10)).not.toThrow()
	})

	it('hides every rect once the selection scrolls out of view', () => {
		const parent = document.createElement('div')
		const layer = createOverlayLayer(parent)
		const core = makeCore(lines, [{ anchor: 7, focus: 20 }])

		updateSelection(layer, core, metrics, 0, 0, 10)
		expect(layer.selectionEls.some((e) => e.style.display !== 'none')).toBe(true)

		// Same selection, viewport scrolled far past it.
		updateSelection(layer, core, metrics, 0, 30, 40)
		expect(layer.selectionEls.every((e) => e.style.display === 'none')).toBe(true)
	})
})
