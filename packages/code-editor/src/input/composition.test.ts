import { describe, it, expect } from 'vitest'
import { makeEditorCore } from '../core/makeEditorCore'
import { createCompositionMachine } from './composition'
import type { EditorCore } from '../core/types'

const createCore = (content = 'hello world') =>
	makeEditorCore({ document: { key: 'test.ts', content } })

describe('CompositionMachine', () => {
	describe('state transitions', () => {
		it('starts in idle state', () => {
			const machine = createCompositionMachine()
			expect(machine.getState().state).toBe('idle')
			expect(machine.isComposing()).toBe(false)
		})

		it('transitions to composing on start', () => {
			const core = createCore()
			const machine = createCompositionMachine()
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			machine.start(core)
			expect(machine.getState().state).toBe('composing')
			expect(machine.isComposing()).toBe(true)
		})

		it('transitions to idle after end', () => {
			const core = createCore()
			const machine = createCompositionMachine()
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			machine.start(core)
			machine.end(core, 'XY')
			expect(machine.getState().state).toBe('idle')
			expect(machine.isComposing()).toBe(false)
		})

		it('transitions to idle after cancel', () => {
			const core = createCore()
			const machine = createCompositionMachine()
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			machine.start(core)
			machine.cancel(core)
			expect(machine.getState().state).toBe('idle')
			expect(machine.isComposing()).toBe(false)
		})
	})

	describe('text updates during composition', () => {
		it('update replaces composition range with new text', () => {
			const core = createCore('hello world')
			const machine = createCompositionMachine()
			// Place cursor at offset 5
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			machine.start(core)
			machine.update(core, 'X')

			// Should have inserted 'X' at offset 5 (replacing empty range)
			expect(core.getTextRange(5, 6)).toBe('X')
		})

		it('subsequent updates replace the growing composition range', () => {
			const core = createCore('hello world')
			const machine = createCompositionMachine()
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			machine.start(core)
			machine.update(core, 'A') // inserts 'A' at 5
			machine.update(core, 'AB') // replaces 'A' with 'AB' at 5
			machine.update(core, 'ABC') // replaces 'AB' with 'ABC' at 5

			expect(core.getTextRange(5, 8)).toBe('ABC')
		})

		it('end with final text commits the composition', () => {
			const core = createCore('hello world')
			const machine = createCompositionMachine()
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			machine.start(core)
			machine.update(core, '中')
			machine.update(core, '中文')
			machine.end(core, '中文')

			expect(core.getTextRange(5, 7)).toBe('中文')
		})
	})

	describe('composition with selection', () => {
		it('captures selected text as original text', () => {
			const core = createCore('hello world')
			const machine = createCompositionMachine()
			core.dispatch({ type: 'set-selection', anchor: 0, focus: 5 })

			machine.start(core)
			const state = machine.getState()
			if (state.state === 'composing') {
				expect(state.originalText).toBe('hello')
				expect(state.rangeStart).toBe(0)
				expect(state.rangeLength).toBe(5)
			}
		})
	})

	describe('cancellation', () => {
		it('cancel restores original text', () => {
			const core = createCore('hello world')
			const machine = createCompositionMachine()
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			machine.start(core)
			machine.update(core, 'XYZ')
			machine.cancel(core)

			// 'XYZ' should be removed, original text restored
			const text = core.getTextRange(0, core.getDocumentLength())
			expect(text).toBe('hello world')
		})

		it('cancel during idle is a no-op', () => {
			const core = createCore()
			const machine = createCompositionMachine()
			machine.cancel(core) // should not throw
			expect(machine.getState().state).toBe('idle')
		})
	})

	describe('edge cases', () => {
		it('start during composing force-cancels first', () => {
			const core = createCore('hello world')
			const machine = createCompositionMachine()
			core.dispatch({ type: 'set-selection', anchor: 5, focus: 5 })

			machine.start(core)
			machine.update(core, 'X')

			// Start again — should cancel previous composition
			machine.start(core)
			expect(machine.isComposing()).toBe(true)

			// The 'X' should have been cancelled
			const text = core.getTextRange(0, core.getDocumentLength())
			expect(text).toBe('hello world')
		})

		it('update during idle is ignored', () => {
			const core = createCore()
			const machine = createCompositionMachine()
			machine.update(core, 'X') // should not throw or change document
			expect(machine.getState().state).toBe('idle')
		})

		it('end during idle is ignored', () => {
			const core = createCore()
			const machine = createCompositionMachine()
			machine.end(core, 'X') // should not throw
			expect(machine.getState().state).toBe('idle')
		})
	})
})
