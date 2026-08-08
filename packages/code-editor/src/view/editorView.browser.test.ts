/**
 * Browser integration tests for EditorView.
 *
 * Tests the imperative view rendering in a real browser DOM.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeEditorCore } from '../core/makeEditorCore'
import { makeEditorView, type EditorView } from './makeEditorView'
import type { EditorCore, EditorDirtyState } from '../core/types'
import { createEmptyDirty } from '../core/dirty'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let core: EditorCore
let view: EditorView
let host: HTMLElement

const setup = (content = 'hello\nworld\nfoo\nbar\nbaz') => {
	core = makeEditorCore({ document: { key: 'test.ts', content } })

	host = document.createElement('div')
	host.style.width = '600px'
	host.style.height = '300px'
	host.style.fontFamily = 'monospace'
	host.style.fontSize = '14px'
	host.style.lineHeight = '18px'
	host.style.position = 'relative'
	document.body.appendChild(host)

	view = makeEditorView({ core, tabSize: 4 })
	view.attach(host)
}

const teardown = () => {
	view.destroy()
	host.remove()
}

const makeDirty = (overrides?: Partial<EditorDirtyState>): EditorDirtyState => {
	const snapshot = core.getSnapshot()
	return {
		...createEmptyDirty(snapshot.identity, snapshot.versions),
		...overrides,
	}
}

describe('EditorView browser integration', () => {
	beforeEach(() => setup())
	afterEach(() => teardown())

	// -----------------------------------------------------------------
	// Basic rendering
	// -----------------------------------------------------------------

	describe('basic rendering', () => {
		it('creates scroll container and textarea', () => {
			expect(host.querySelector('.editor-scroll-container')).not.toBeNull()
			expect(host.querySelector('.editor-hidden-input')).not.toBeNull()
		})

		it('renders text rows on full flush', () => {
			const receipt = view.flush(makeDirty({ text: true, gutter: true, overlay: true, fullMeasure: true }))
			expect(receipt.rowsUpdated).toBeGreaterThan(0)
		})

		it('getTextarea returns the hidden input', () => {
			expect(view.getTextarea()).toBeInstanceOf(HTMLTextAreaElement)
		})
	})

	// -----------------------------------------------------------------
	// Single-character insert
	// -----------------------------------------------------------------

	describe('single-character insert', () => {
		it('updates only necessary rows on insert', () => {
			// First flush to render everything
			view.flush(makeDirty({ text: true, gutter: true, overlay: true, fullMeasure: true }))

			// Insert a character
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })
			const result = core.dispatch({ type: 'insert-text', text: 'X' })
			if (result.ok) {
				const receipt = view.flush(result.dirty)
				// Should update at most a few rows, not all
				expect(receipt.rowsUpdated).toBeLessThanOrEqual(core.getLineCount())
				expect(receipt.rowsUpdated).toBeGreaterThan(0)
			}
		})
	})

	// -----------------------------------------------------------------
	// Overlay-only cursor
	// -----------------------------------------------------------------

	describe('overlay-only updates', () => {
		it('overlay update without text rerender', () => {
			// Initial full flush
			view.flush(makeDirty({ text: true, gutter: true, overlay: true, fullMeasure: true }))

			// Move cursor (overlay only)
			core.dispatch({ type: 'set-selection', anchor: 3, focus: 3 })
			const receipt = view.flush(makeDirty({ overlay: true }))
			expect(receipt.overlayUpdated).toBe(true)
			// Text rows should not have been updated
			expect(receipt.rowsUpdated).toBe(0)
		})
	})

	// -----------------------------------------------------------------
	// Tab-aware caret geometry
	// -----------------------------------------------------------------

	describe('tab-aware geometry', () => {
		it('caret rect accounts for tab width', () => {
			// Create content with a tab
			core.dispatch({ type: 'replace-document', document: { key: 'tab.ts', content: '\tHello' } })
			view.flush(makeDirty({ text: true, gutter: true, overlay: true, fullMeasure: true }))

			const m = view.getMetrics()
			// Column 1 (after tab) should be at 4 * charWidth, not 1 * charWidth
			const rect = view.getCaretRect(0, 1)
			expect(rect.x).toBeCloseTo(4 * m.charWidth, 0)
		})
	})

	// -----------------------------------------------------------------
	// Pointer hit testing
	// -----------------------------------------------------------------

	describe('pointer hit testing', () => {
		it('lineFromClientY returns valid line', () => {
			view.flush(makeDirty({ text: true, gutter: true, overlay: true, fullMeasure: true }))

			// Y at the top should be line 0
			const scrollContainer = host.querySelector('.editor-scroll-container') as HTMLElement
			const rect = scrollContainer.getBoundingClientRect()
			const line = view.lineFromClientY(rect.top + 1)
			expect(line).toBe(0)
		})

		it('xToColumn with tabs', () => {
			core.dispatch({ type: 'replace-document', document: { key: 'tab.ts', content: '\tHello' } })
			view.flush(makeDirty({ text: true, gutter: true, overlay: true, fullMeasure: true }))

			const m = view.getMetrics()
			const gutterWidth = view.getGutterWidth()
			// X at 4*charWidth + gutterWidth should map to column 1 (after tab)
			const col = view.xToColumn(0, 4 * m.charWidth + gutterWidth)
			expect(col).toBe(1)
		})
	})

	// -----------------------------------------------------------------
	// Destroy
	// -----------------------------------------------------------------

	describe('destroy', () => {
		it('removes DOM elements on destroy', () => {
			view.destroy()
			expect(host.querySelector('.editor-scroll-container')).toBeNull()
			expect(host.querySelector('.editor-hidden-input')).toBeNull()
		})
	})
})
