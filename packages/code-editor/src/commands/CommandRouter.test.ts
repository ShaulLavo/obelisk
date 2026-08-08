import { describe, it, expect, vi } from 'vitest'
import { makeEditorCore } from '../core/makeEditorCore'
import { createCommandRouter, type CommandRouter } from './CommandRouter'
import type { EditorCore } from '../core/types'

const createCore = (content = 'hello\nworld\nfoo') =>
	makeEditorCore({ document: { key: 'test.ts', content } })

const createRouter = (core: EditorCore, overrides?: { onClipboardWrite?: (text: string) => void; onSave?: () => void }) =>
	createCommandRouter({ core, tabSize: 4, ...overrides })

describe('CommandRouter', () => {
	// -----------------------------------------------------------------
	// Text insertion
	// -----------------------------------------------------------------

	describe('text insertion', () => {
		it('insert-text dispatches to core', () => {
			const core = createCore()
			const router = createRouter(core)
			// Cursor at 0
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			const result = router.execute({ type: 'insert-text', text: 'X' })
			expect(result?.ok).toBe(true)
			expect(core.getLineText(0)).toBe('Xhello')
		})

		it('insert-newline inserts a newline', () => {
			const core = createCore()
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			router.execute({ type: 'insert-newline' })
			expect(core.getLineCount()).toBe(4)
		})
	})

	// -----------------------------------------------------------------
	// Deletion
	// -----------------------------------------------------------------

	describe('deletion', () => {
		it('delete-backward removes character', () => {
			const core = createCore()
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 1, focus: 1 })

			router.execute({ type: 'delete-backward', byWord: false })
			expect(core.getLineText(0)).toBe('ello')
		})

		it('delete-forward removes next character', () => {
			const core = createCore()
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			router.execute({ type: 'delete-forward', byWord: false })
			expect(core.getLineText(0)).toBe('ello')
		})
	})

	// -----------------------------------------------------------------
	// Navigation
	// -----------------------------------------------------------------

	describe('navigation', () => {
		it('move-cursor right advances cursor', () => {
			const core = createCore()
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			router.execute({ type: 'move-cursor', direction: 'right', byWord: false, extend: false })
			const sel = core.getSelections()[0]!
			expect(sel.anchor).toBe(1)
			expect(sel.focus).toBe(1)
		})

		it('select-all selects entire document', () => {
			const core = createCore()
			const router = createRouter(core)

			router.execute({ type: 'select-all' })
			const sel = core.getSelections()[0]!
			expect(Math.abs(sel.focus - sel.anchor)).toBe(core.getDocumentLength())
		})
	})

	// -----------------------------------------------------------------
	// History
	// -----------------------------------------------------------------

	describe('history', () => {
		it('undo reverses last edit', () => {
			const core = createCore()
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })
			router.execute({ type: 'insert-text', text: 'X' })
			expect(core.getLineText(0)).toBe('Xhello')

			router.execute({ type: 'undo' })
			expect(core.getLineText(0)).toBe('hello')
		})

		it('redo re-applies undone edit', () => {
			const core = createCore()
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })
			router.execute({ type: 'insert-text', text: 'X' })
			router.execute({ type: 'undo' })
			router.execute({ type: 'redo' })
			expect(core.getLineText(0)).toBe('Xhello')
		})
	})

	// -----------------------------------------------------------------
	// Clipboard
	// -----------------------------------------------------------------

	describe('clipboard', () => {
		it('copy calls onClipboardWrite with selected text', () => {
			const core = createCore()
			const onWrite = vi.fn()
			const router = createRouter(core, { onClipboardWrite: onWrite })
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 5 })

			router.execute({ type: 'copy' })
			expect(onWrite).toHaveBeenCalledWith('hello')
		})

		it('copy does nothing with no selection', () => {
			const core = createCore()
			const onWrite = vi.fn()
			const router = createRouter(core, { onClipboardWrite: onWrite })
			core.dispatch({ type: 'set-selection', anchor: 3, focus: 3 })

			router.execute({ type: 'copy' })
			expect(onWrite).not.toHaveBeenCalled()
		})

		it('cut copies and deletes selected text', () => {
			const core = createCore()
			const onWrite = vi.fn()
			const router = createRouter(core, { onClipboardWrite: onWrite })
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 5 })

			router.execute({ type: 'cut' })
			expect(onWrite).toHaveBeenCalledWith('hello')
			expect(core.getLineText(0)).toBe('')
		})

		it('paste inserts text', () => {
			const core = createCore()
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			router.execute({ type: 'paste', text: 'ABC' })
			expect(core.getLineText(0)).toBe('ABChello')
		})
	})

	// -----------------------------------------------------------------
	// Indent / Dedent
	// -----------------------------------------------------------------

	describe('indent/dedent', () => {
		it('indent inserts tab at cursor when no selection', () => {
			const core = createCore()
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 0 })

			router.execute({ type: 'indent' })
			expect(core.getLineText(0)).toBe('\thello')
		})

		it('indent inserts tab at start of each selected line', () => {
			const core = createCore('aaa\nbbb\nccc')
			const router = createRouter(core)
			// Select from line 0 to line 2
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 11 })

			router.execute({ type: 'indent' })
			expect(core.getLineText(0)).toBe('\taaa')
			expect(core.getLineText(1)).toBe('\tbbb')
			expect(core.getLineText(2)).toBe('\tccc')
		})

		it('dedent removes tab from line start', () => {
			const core = createCore('\taaa\n\tbbb\n\tccc')
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 14 })

			router.execute({ type: 'dedent' })
			expect(core.getLineText(0)).toBe('aaa')
			expect(core.getLineText(1)).toBe('bbb')
			expect(core.getLineText(2)).toBe('ccc')
		})

		it('dedent removes up to tabSize spaces', () => {
			const core = createCore('    aaa\n  bbb\nccc')
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 17 })

			router.execute({ type: 'dedent' })
			expect(core.getLineText(0)).toBe('aaa')
			expect(core.getLineText(1)).toBe('bbb')
			expect(core.getLineText(2)).toBe('ccc')
		})

		it('dedent does nothing when no leading whitespace', () => {
			const core = createCore('aaa\nbbb')
			const router = createRouter(core)
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 7 })

			const result = router.execute({ type: 'dedent' })
			expect(result).toBeNull()
			expect(core.getLineText(0)).toBe('aaa')
		})
	})

	// -----------------------------------------------------------------
	// Save
	// -----------------------------------------------------------------

	describe('save', () => {
		it('calls onSave callback', () => {
			const core = createCore()
			const onSave = vi.fn()
			const router = createRouter(core, { onSave })

			router.execute({ type: 'save' })
			expect(onSave).toHaveBeenCalledOnce()
		})

		it('returns null (no transaction)', () => {
			const core = createCore()
			const router = createRouter(core)

			const result = router.execute({ type: 'save' })
			expect(result).toBeNull()
		})
	})
})
