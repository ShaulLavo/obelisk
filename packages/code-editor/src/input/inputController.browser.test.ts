/**
 * Browser integration tests for InputController.
 *
 * These tests exercise the full path:
 *   DOM event → InputController → CommandRouter → EditorCore
 *
 * They use a real textarea in the browser and simulate events.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeEditorCore } from '../core/makeEditorCore'
import { makeInputController, type InputController } from './makeInputController'
import type { EditorCore } from '../core/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let core: EditorCore
let controller: InputController
let textarea: HTMLTextAreaElement

const setup = (content = 'hello\nworld\nfoo') => {
	core = makeEditorCore({ document: { key: 'test.ts', content } })
	controller = makeInputController({
		core,
		tabSize: 4,
		isMac: navigator.platform.includes('Mac'),
	})
	textarea = document.createElement('textarea')
	document.body.appendChild(textarea)
	controller.attach(textarea)
}

const teardown = () => {
	controller.destroy()
	textarea.remove()
}

/**
 * Simulate a beforeinput event on the textarea.
 */
const fireBeforeInput = (inputType: string, data?: string | null) => {
	const event = new InputEvent('beforeinput', {
		inputType,
		data: data ?? null,
		cancelable: true,
		bubbles: true,
	})
	textarea.dispatchEvent(event)
}

/**
 * Simulate a keydown event.
 */
const fireKeyDown = (key: string, mods?: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }) => {
	const event = new KeyboardEvent('keydown', {
		key,
		ctrlKey: mods?.ctrl ?? false,
		metaKey: mods?.meta ?? false,
		shiftKey: mods?.shift ?? false,
		altKey: mods?.alt ?? false,
		bubbles: true,
		cancelable: true,
	})
	textarea.dispatchEvent(event)
}

/**
 * Simulate composition events.
 */
const fireCompositionStart = () => {
	textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
}
const fireCompositionUpdate = (data: string) => {
	textarea.dispatchEvent(new CompositionEvent('compositionupdate', { data, bubbles: true }))
}
const fireCompositionEnd = (data: string) => {
	textarea.dispatchEvent(new CompositionEvent('compositionend', { data, bubbles: true }))
}

const isMac = navigator.platform.includes('Mac')
const primaryMod = isMac ? { meta: true } : { ctrl: true }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InputController browser integration', () => {
	beforeEach(() => setup())
	afterEach(() => teardown())

	// -----------------------------------------------------------------
	// Ordinary typing
	// -----------------------------------------------------------------

	describe('ordinary typing', () => {
		it('inserts text via beforeinput', () => {
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			fireBeforeInput('insertText', 'A')
			expect(core.getLineText(0)).toBe('Ahello')
		})

		it('inserts multiple characters', () => {
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			fireBeforeInput('insertText', 'A')
			fireBeforeInput('insertText', 'B')
			fireBeforeInput('insertText', 'C')
			expect(core.getLineText(0)).toBe('ABChello')
		})

		it('inserts newline via insertParagraph', () => {
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			fireBeforeInput('insertParagraph')
			expect(core.getLineCount()).toBe(4)
		})

		it('inserts newline via insertLineBreak', () => {
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			fireBeforeInput('insertLineBreak')
			expect(core.getLineCount()).toBe(4)
		})
	})

	// -----------------------------------------------------------------
	// Paste, delete, undo/redo
	// -----------------------------------------------------------------

	describe('paste, delete, undo/redo', () => {
		it('paste via beforeinput inserts text', () => {
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			// Simulate paste with DataTransfer
			const dt = new DataTransfer()
			dt.setData('text/plain', 'PASTED')
			const event = new InputEvent('beforeinput', {
				inputType: 'insertFromPaste',
				dataTransfer: dt,
				cancelable: true,
				bubbles: true,
			})
			textarea.dispatchEvent(event)

			expect(core.getLineText(0)).toBe('PASTEDhello')
		})

		it('delete backward via beforeinput', () => {
			core.dispatch({ type: 'set-selection', anchor: 1, focus: 1 })

			fireBeforeInput('deleteContentBackward')
			expect(core.getLineText(0)).toBe('ello')
		})

		it('delete forward via beforeinput', () => {
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			fireBeforeInput('deleteContentForward')
			expect(core.getLineText(0)).toBe('ello')
		})

		it('undo via keydown reverses typing', () => {
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })
			fireBeforeInput('insertText', 'X')
			expect(core.getLineText(0)).toBe('Xhello')

			fireKeyDown('z', primaryMod)
			expect(core.getLineText(0)).toBe('hello')
		})

		it('redo via keydown re-applies', () => {
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })
			fireBeforeInput('insertText', 'X')
			fireKeyDown('z', primaryMod) // undo
			fireKeyDown('z', { ...primaryMod, shift: true }) // redo
			expect(core.getLineText(0)).toBe('Xhello')
		})
	})

	// -----------------------------------------------------------------
	// Composition (Chromium-family behavior)
	// -----------------------------------------------------------------

	describe('composition - Chromium behavior', () => {
		it('basic IME composition inserts text', () => {
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			// Chromium sequence: compositionstart → compositionupdate → compositionend
			fireCompositionStart()
			expect(controller.getComposition().isComposing()).toBe(true)

			fireCompositionUpdate('n')
			fireCompositionUpdate('ni')
			fireCompositionEnd('你')

			expect(controller.getComposition().isComposing()).toBe(false)
			expect(core.getTextRange(5, 6)).toBe('你')
		})

		it('composition replaces selected text', () => {
			// Select "hello"
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 5 })

			fireCompositionStart()
			fireCompositionUpdate('k')
			fireCompositionUpdate('ko')
			fireCompositionEnd('こ')

			// "hello" should be replaced with "こ"
			const text = core.getTextRange(0, core.getDocumentLength())
			expect(text.startsWith('こ')).toBe(true)
			expect(text).not.toContain('hello')
		})

		it('cancelled composition restores original text', () => {
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })
			const originalText = core.getTextRange(0, core.getDocumentLength())

			fireCompositionStart()
			fireCompositionUpdate('x')
			fireCompositionUpdate('xy')

			// Force cancel
			controller.getComposition().cancel(core)

			const text = core.getTextRange(0, core.getDocumentLength())
			expect(text).toBe(originalText)
		})

		it('keydown events are suppressed during composition', () => {
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			fireCompositionStart()
			fireCompositionUpdate('a')

			// Arrow key during composition should be ignored by our controller
			fireKeyDown('ArrowLeft')
			// Cursor should still be where composition placed it, not moved left
			// (The composition machine is managing the cursor)

			fireCompositionEnd('あ')
			expect(core.getTextRange(0, 1)).toBe('あ')
		})
	})

	// -----------------------------------------------------------------
	// Composition (WebKit-family behavior simulation)
	// -----------------------------------------------------------------

	describe('composition - WebKit behavior', () => {
		it('handles compositionend with final text that differs from updates', () => {
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			// WebKit may send unreliable intermediate text
			fireCompositionStart()
			fireCompositionUpdate('w')
			fireCompositionUpdate('wo')
			// Final text may differ from last update
			fireCompositionEnd('我')

			expect(core.getTextRange(5, 6)).toBe('我')
		})

		it('handles empty composition gracefully', () => {
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })
			const originalText = core.getTextRange(0, core.getDocumentLength())

			fireCompositionStart()
			// No updates
			fireCompositionEnd('')

			// Document should be unchanged
			const text = core.getTextRange(0, core.getDocumentLength())
			expect(text).toBe(originalText)
		})
	})

	// -----------------------------------------------------------------
	// Mirror sync
	// -----------------------------------------------------------------

	describe('mirror sync', () => {
		it('syncs textarea content after typing', () => {
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })
			fireBeforeInput('insertText', 'X')

			// After typing, the mirror should be synced
			expect(textarea.value).toContain('X')
		})
	})
})
