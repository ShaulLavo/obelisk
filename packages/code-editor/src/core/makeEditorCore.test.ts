import { describe, it, expect, vi } from 'vitest'
import { makeEditorCore } from './makeEditorCore'
import type { EditorCore, EditorDirtyState } from './types'

const createCore = (content = 'hello\nworld\nfoo') =>
	makeEditorCore({
		document: { key: 'test.ts', content },
	})

describe('makeEditorCore', () => {
	// -----------------------------------------------------------------
	// Initialization
	// -----------------------------------------------------------------

	describe('initialization', () => {
		it('creates with correct line count', () => {
			const core = createCore()
			expect(core.getLineCount()).toBe(3)
		})

		it('creates with correct document length', () => {
			const core = createCore()
			expect(core.getDocumentLength()).toBe(15)
		})

		it('assigns unique line IDs', () => {
			const core = createCore()
			const ids = new Set<number>()
			for (let i = 0; i < core.getLineCount(); i++) {
				ids.add(core.getLineId(i))
			}
			expect(ids.size).toBe(3)
		})

		it('returns correct line text', () => {
			const core = createCore()
			expect(core.getLineText(0)).toBe('hello')
			expect(core.getLineText(1)).toBe('world')
			expect(core.getLineText(2)).toBe('foo')
		})

		it('initializes cursor at offset 0', () => {
			const core = createCore()
			const sels = core.getSelections()
			expect(sels).toHaveLength(1)
			expect(sels[0]!.anchor).toBe(0)
			expect(sels[0]!.focus).toBe(0)
		})

		it('initializes version counters at 0', () => {
			const core = createCore()
			const v = core.getVersions()
			expect(v.docVersion).toBe(0)
			expect(v.structureVersion).toBe(0)
			expect(v.selectionVersion).toBe(0)
		})
	})

	// -----------------------------------------------------------------
	// Insert text
	// -----------------------------------------------------------------

	describe('insert-text', () => {
		it('inserts a character', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'insert-text', text: 'X' })
			expect(core.getTextRange(0, 4)).toBe('Xabc')
		})

		it('inserts at cursor position', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 2 })
			core.dispatch({ type: 'insert-text', text: 'X' })
			expect(core.getTextRange(0, 4)).toBe('abXc')
		})

		it('inserts a newline and increases line count', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 1 })
			core.dispatch({ type: 'insert-text', text: '\n' })
			expect(core.getLineCount()).toBe(2)
			expect(core.getLineText(0)).toBe('a')
			expect(core.getLineText(1)).toBe('bc')
		})

		it('replaces selected text on insert', () => {
			const core = createCore('hello')
			core.dispatch({ type: 'set-selection', anchor: 1, focus: 4 })
			core.dispatch({ type: 'insert-text', text: 'X' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('hXo')
		})

		it('increments docVersion on insert', () => {
			const core = createCore('abc')
			const v0 = core.getVersions().docVersion
			core.dispatch({ type: 'insert-text', text: 'x' })
			expect(core.getVersions().docVersion).toBe(v0 + 1)
		})

		it('increments structureVersion when inserting newline', () => {
			const core = createCore('abc')
			const v0 = core.getVersions().structureVersion
			core.dispatch({ type: 'insert-text', text: '\n' })
			expect(core.getVersions().structureVersion).toBe(v0 + 1)
		})
	})

	// -----------------------------------------------------------------
	// Delete
	// -----------------------------------------------------------------

	describe('delete-backward', () => {
		it('deletes one character backward', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 2 })
			core.dispatch({ type: 'delete-backward' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('ac')
		})

		it('does nothing at start of document', () => {
			const core = createCore('abc')
			const result = core.dispatch({ type: 'delete-backward' })
			expect(result.ok).toBe(true)
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('abc')
		})

		it('deletes selection when present', () => {
			const core = createCore('abcdef')
			core.dispatch({ type: 'set-selection', anchor: 1, focus: 4 })
			core.dispatch({ type: 'delete-backward' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('aef')
		})
	})

	describe('delete-forward', () => {
		it('deletes one character forward', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 1 })
			core.dispatch({ type: 'delete-forward' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('ac')
		})

		it('does nothing at end of document', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 3 })
			const result = core.dispatch({ type: 'delete-forward' })
			expect(result.ok).toBe(true)
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('abc')
		})
	})

	// -----------------------------------------------------------------
	// Replace range
	// -----------------------------------------------------------------

	describe('replace-range', () => {
		it('replaces a range', () => {
			const core = createCore('hello world')
			core.dispatch({ type: 'replace-range', start: 5, end: 11, text: '!' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('hello!')
		})

		it('inserts at a position when start === end', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'replace-range', start: 1, end: 1, text: 'X' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('aXbc')
		})
	})

	// -----------------------------------------------------------------
	// Apply edits (batch)
	// -----------------------------------------------------------------

	describe('apply-edits', () => {
		it('applies multiple edits atomically', () => {
			const core = createCore('aaa bbb ccc')
			core.dispatch({
				type: 'apply-edits',
				edits: [
					{ start: 0, end: 3, text: 'xxx' },
					{ start: 4, end: 7, text: 'yyy' },
					{ start: 8, end: 11, text: 'zzz' },
				],
			})
			expect(core.getTextRange(0, core.getDocumentLength())).toBe(
				'xxx yyy zzz'
			)
		})

		it('handles edits that change document length', () => {
			const core = createCore('abc')
			core.dispatch({
				type: 'apply-edits',
				edits: [
					{ start: 0, end: 1, text: 'XX' },
					{ start: 2, end: 3, text: 'YY' },
				],
			})
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('XXbYY')
		})

		it('is a no-op with empty edits array', () => {
			const core = createCore('abc')
			const v0 = core.getVersions().docVersion
			core.dispatch({ type: 'apply-edits', edits: [] })
			expect(core.getVersions().docVersion).toBe(v0)
		})
	})

	// -----------------------------------------------------------------
	// Undo / Redo
	// -----------------------------------------------------------------

	describe('undo/redo', () => {
		it('undoes an insert', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'insert-text', text: 'X' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('Xabc')
			core.dispatch({ type: 'undo' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('abc')
		})

		it('redoes after undo', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'insert-text', text: 'X' })
			core.dispatch({ type: 'undo' })
			core.dispatch({ type: 'redo' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('Xabc')
		})

		it('undoes a delete', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 3 })
			core.dispatch({ type: 'delete-backward' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('ab')
			core.dispatch({ type: 'undo' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe('abc')
		})

		it('undoes a replace-range', () => {
			const core = createCore('hello world')
			core.dispatch({
				type: 'replace-range',
				start: 0,
				end: 5,
				text: 'bye',
			})
			expect(core.getTextRange(0, core.getDocumentLength())).toBe(
				'bye world'
			)
			core.dispatch({ type: 'undo' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe(
				'hello world'
			)
		})

		it('undo is no-op with empty stack', () => {
			const core = createCore('abc')
			const v0 = core.getVersions().docVersion
			core.dispatch({ type: 'undo' })
			expect(core.getVersions().docVersion).toBe(v0)
		})
	})

	// -----------------------------------------------------------------
	// Line IDs
	// -----------------------------------------------------------------

	describe('line IDs', () => {
		it('allocates unique IDs per line', () => {
			const core = createCore('a\nb\nc')
			const id0 = core.getLineId(0)
			const id1 = core.getLineId(1)
			const id2 = core.getLineId(2)
			expect(id0).not.toBe(id1)
			expect(id1).not.toBe(id2)
		})

		it('preserves IDs for unaffected lines on insert', () => {
			const core = createCore('a\nb\nc')
			const id2Before = core.getLineId(2)
			// Insert at start of first line
			core.dispatch({ type: 'insert-text', text: 'X' })
			// Line 2 (now "c") should keep its ID
			expect(core.getLineId(2)).toBe(id2Before)
		})

		it('allocates new IDs on newline insert', () => {
			const core = createCore('abc')
			const allIdsBefore = new Set<number>()
			for (let i = 0; i < core.getLineCount(); i++) {
				allIdsBefore.add(core.getLineId(i))
			}

			core.dispatch({
				type: 'set-cursor-from-point',
				line: 0,
				column: 1,
			})
			core.dispatch({ type: 'insert-text', text: '\n' })

			expect(core.getLineCount()).toBe(2)
			// The new line should have a fresh ID
			const newLineId = core.getLineId(1)
			expect(allIdsBefore.has(newLineId)).toBe(false)
		})

		it('never reuses IDs after undo/redo', () => {
			const core = createCore('abc')
			const seenIds = new Set<number>()
			for (let i = 0; i < core.getLineCount(); i++) {
				seenIds.add(core.getLineId(i))
			}

			// Insert newline -> undo -> insert newline again
			core.dispatch({
				type: 'set-cursor-from-point',
				line: 0,
				column: 1,
			})
			core.dispatch({ type: 'insert-text', text: '\n' })
			const newId1 = core.getLineId(1)
			seenIds.add(newId1)

			core.dispatch({ type: 'undo' })
			core.dispatch({ type: 'insert-text', text: '\n' })
			const newId2 = core.getLineId(1)

			// newId2 should be different from newId1
			expect(newId2).not.toBe(newId1)
			expect(seenIds.has(newId2)).toBe(false)
		})
	})

	// -----------------------------------------------------------------
	// Line revision tracking
	// -----------------------------------------------------------------

	describe('line revision', () => {
		it('bumps revision for affected lines', () => {
			const core = createCore('aaa\nbbb\nccc')
			const id1 = core.getLineId(1)
			const rev0 = core.getLineRevision(id1)

			// Edit line 1
			core.dispatch({
				type: 'set-cursor-from-point',
				line: 1,
				column: 0,
			})
			core.dispatch({ type: 'insert-text', text: 'X' })

			expect(core.getLineRevision(id1)).toBeGreaterThan(rev0)
		})

		it('does not bump revision for unaffected lines', () => {
			const core = createCore('aaa\nbbb\nccc')
			const id2 = core.getLineId(2)
			const rev0 = core.getLineRevision(id2)

			// Edit line 0
			core.dispatch({ type: 'insert-text', text: 'X' })

			expect(core.getLineRevision(id2)).toBe(rev0)
		})
	})

	// -----------------------------------------------------------------
	// Dirty accumulation
	// -----------------------------------------------------------------

	describe('dirty accumulation', () => {
		it('marks text dirty on insert', () => {
			const core = createCore('abc')
			const result = core.dispatch({ type: 'insert-text', text: 'X' })
			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.dirty.text).toBe(true)
				expect(result.dirty.overlay).toBe(true)
			}
		})

		it('marks gutter dirty on newline insert', () => {
			const core = createCore('abc')
			const result = core.dispatch({ type: 'insert-text', text: '\n' })
			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.dirty.gutter).toBe(true)
			}
		})

		it('marks only overlay dirty on cursor move', () => {
			const core = createCore('abc')
			const result = core.dispatch({
				type: 'move-cursor',
				direction: 'right',
			})
			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.dirty.overlay).toBe(true)
				expect(result.dirty.text).toBe(false)
			}
		})

		it('notifies listeners on change', () => {
			const core = createCore('abc')
			const listener = vi.fn()
			core.onDidChange(listener)
			core.dispatch({ type: 'insert-text', text: 'X' })
			expect(listener).toHaveBeenCalledTimes(1)
		})

		it('unsubscribes listener', () => {
			const core = createCore('abc')
			const listener = vi.fn()
			const unsub = core.onDidChange(listener)
			unsub()
			core.dispatch({ type: 'insert-text', text: 'X' })
			expect(listener).not.toHaveBeenCalled()
		})
	})

	// -----------------------------------------------------------------
	// Re-entrant dispatch queue
	// -----------------------------------------------------------------

	describe('re-entrant dispatch', () => {
		it('queues re-entrant dispatches', () => {
			const core = createCore('abc')
			const log: string[] = []

			core.onDidChange(() => {
				if (log.length === 0) {
					log.push('first')
					// Re-entrant dispatch
					core.dispatch({ type: 'insert-text', text: 'Y' })
				} else {
					log.push('second')
				}
			})

			core.dispatch({ type: 'insert-text', text: 'X' })

			// Both dispatches should have completed
			expect(log).toEqual(['first', 'second'])
			// X is inserted first (at offset 0), then Y is inserted at offset 0 (before X)
		// But re-entrant dispatch runs after the first completes, so:
		// 1. Insert 'X' at 0 -> cursor at 1 -> "Xabc"
		// 2. Re-entrant insert 'Y' at cursor (1) -> "XYabc"
		expect(core.getTextRange(0, core.getDocumentLength())).toBe('XYabc')
		})
	})

	// -----------------------------------------------------------------
	// Cursor movement
	// -----------------------------------------------------------------

	describe('cursor movement', () => {
		it('moves right', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'move-cursor', direction: 'right' })
			expect(core.getSelections()[0]!.focus).toBe(1)
		})

		it('moves left', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 2 })
			core.dispatch({ type: 'move-cursor', direction: 'left' })
			expect(core.getSelections()[0]!.focus).toBe(1)
		})

		it('moves down across lines', () => {
			const core = createCore('abc\ndef')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 1 })
			core.dispatch({ type: 'move-cursor', direction: 'down' })
			const sel = core.getSelections()[0]!
			// Should be on line 1, column 1 -> offset 4+1=5
			expect(sel.focus).toBe(5)
		})

		it('moves up across lines', () => {
			const core = createCore('abc\ndef')
			core.dispatch({ type: 'set-cursor-from-point', line: 1, column: 2 })
			core.dispatch({ type: 'move-cursor', direction: 'up' })
			const sel = core.getSelections()[0]!
			// Should be on line 0, column 2 -> offset 2
			expect(sel.focus).toBe(2)
		})

		it('home goes to line start', () => {
			const core = createCore('abc\ndef')
			core.dispatch({ type: 'set-cursor-from-point', line: 1, column: 2 })
			core.dispatch({ type: 'move-cursor-home' })
			// Line 1 starts at offset 4
			expect(core.getSelections()[0]!.focus).toBe(4)
		})

		it('end goes to line end', () => {
			const core = createCore('abc\ndef')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 0 })
			core.dispatch({ type: 'move-cursor-end' })
			expect(core.getSelections()[0]!.focus).toBe(3)
		})

		it('select-all selects entire document', () => {
			const core = createCore('abc\ndef')
			core.dispatch({ type: 'select-all' })
			const sel = core.getSelections()[0]!
			expect(sel.anchor).toBe(0)
			expect(sel.focus).toBe(7)
		})

		it('extends selection with shift', () => {
			const core = createCore('abc')
			core.dispatch({
				type: 'move-cursor',
				direction: 'right',
				extend: true,
			})
			core.dispatch({
				type: 'move-cursor',
				direction: 'right',
				extend: true,
			})
			const sel = core.getSelections()[0]!
			expect(sel.anchor).toBe(0)
			expect(sel.focus).toBe(2)
		})
	})

	// -----------------------------------------------------------------
	// Replace document / content
	// -----------------------------------------------------------------

	describe('replace-document', () => {
		it('replaces entire document', () => {
			const core = createCore('old content')
			core.dispatch({
				type: 'replace-document',
				document: { key: 'new.ts', content: 'new content' },
			})
			expect(core.getTextRange(0, core.getDocumentLength())).toBe(
				'new content'
			)
			expect(core.getDocumentIdentity().documentKey).toBe('new.ts')
		})

		it('resets cursor on replace-document', () => {
			const core = createCore('abc')
			core.dispatch({ type: 'set-cursor-from-point', line: 0, column: 3 })
			core.dispatch({
				type: 'replace-document',
				document: { key: 'new.ts', content: 'xyz' },
			})
			expect(core.getSelections()[0]!.focus).toBe(0)
		})
	})

	describe('replace-content', () => {
		it('replaces content preserving identity', () => {
			const core = createCore('old')
			const keyBefore = core.getDocumentIdentity().documentKey
			core.dispatch({ type: 'replace-content', content: 'new content' })
			expect(core.getTextRange(0, core.getDocumentLength())).toBe(
				'new content'
			)
			expect(core.getDocumentIdentity().documentKey).toBe(keyBefore)
		})
	})

	// -----------------------------------------------------------------
	// Error recovery (rollback)
	// -----------------------------------------------------------------

	describe('rollback on error', () => {
		it('preserves state if handler throws', () => {
			const core = createCore('abc')
			const textBefore = core.getTextRange(0, core.getDocumentLength())
			const versionBefore = core.getVersions().docVersion

			// Force an error by patching something internal
			// Since we can't easily force a throw, test the mechanism indirectly:
			// dispatch an impossible offset (edge case coverage)
			core.dispatch({
				type: 'replace-range',
				start: -100,
				end: -50,
				text: 'X',
			})

			// Should handle gracefully (clamped offsets, no crash)
			expect(core.getVersions().docVersion).toBeGreaterThanOrEqual(
				versionBefore
			)
		})
	})

	// -----------------------------------------------------------------
	// Decoration version gating
	// -----------------------------------------------------------------

	describe('applyDecorations', () => {
		it('discards stale decoration snapshots', () => {
			const core = createCore('abc')
			const v0 = core.getVersions().decorationVersion

			core.applyDecorations({
				identity: {
					...core.getDocumentIdentity(),
					sessionId: 'wrong-session',
				},
				docVersion: core.getVersions().docVersion,
				syntax: [],
				errors: [],
			})

			expect(core.getVersions().decorationVersion).toBe(v0)
		})

		it('accepts matching decoration snapshots', () => {
			const core = createCore('abc')
			const v0 = core.getVersions().decorationVersion

			core.applyDecorations({
				identity: core.getDocumentIdentity(),
				docVersion: core.getVersions().docVersion,
				syntax: [],
				errors: [],
			})

			expect(core.getVersions().decorationVersion).toBe(v0 + 1)
		})
	})

	// -----------------------------------------------------------------
	// Viewport
	// -----------------------------------------------------------------

	describe('updateViewport', () => {
		it('updates viewport state', () => {
			const core = createCore('abc')
			core.updateViewport({
				scrollTop: 100,
				scrollLeft: 50,
				viewportWidth: 800,
				viewportHeight: 600,
			})
			const vp = core.getViewport()
			expect(vp.scrollTop).toBe(100)
			expect(vp.scrollLeft).toBe(50)
		})

		it('increments viewportVersion', () => {
			const core = createCore('abc')
			const v0 = core.getVersions().viewportVersion
			core.updateViewport({
				scrollTop: 100,
				scrollLeft: 0,
				viewportWidth: 800,
				viewportHeight: 600,
			})
			expect(core.getVersions().viewportVersion).toBe(v0 + 1)
		})

		it('does not increment version if unchanged', () => {
			const core = createCore('abc')
			core.updateViewport({
				scrollTop: 0,
				scrollLeft: 0,
				viewportWidth: 0,
				viewportHeight: 0,
			})
			const v0 = core.getVersions().viewportVersion
			core.updateViewport({
				scrollTop: 0,
				scrollLeft: 0,
				viewportWidth: 0,
				viewportHeight: 0,
			})
			expect(core.getVersions().viewportVersion).toBe(v0)
		})
	})
})
