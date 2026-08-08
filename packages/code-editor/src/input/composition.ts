/**
 * Composition state machine for IME handling.
 *
 * States: idle → composing → committing → idle
 *                composing → cancelled → idle
 *
 * The state machine enforces legal transitions and prevents
 * illegal states like applying normal text transactions while
 * composition is active.
 *
 * Framework-free. No DOM dependencies.
 */

import type { EditorCore, SelectionRange } from '../core/types'

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type CompositionIdle = { state: 'idle' }

export type CompositionComposing = {
	state: 'composing'
	/** Document offset where composition text starts. */
	rangeStart: number
	/** Current length of composition text in the document. */
	rangeLength: number
	/** Selection state before composition started. */
	selectionBefore: SelectionRange
	/** The original text that was at the composition range (for undo). */
	originalText: string
}

export type CompositionCommitting = {
	state: 'committing'
	rangeStart: number
	rangeLength: number
	selectionBefore: SelectionRange
	originalText: string
}

export type CompositionCancelled = {
	state: 'cancelled'
	rangeStart: number
	rangeLength: number
	selectionBefore: SelectionRange
	originalText: string
}

export type CompositionMachineState =
	| CompositionIdle
	| CompositionComposing
	| CompositionCommitting
	| CompositionCancelled

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export type CompositionMachine = {
	getState(): CompositionMachineState
	/** Called on compositionstart. */
	start(core: EditorCore): void
	/** Called on provisional composition updates (beforeinput/input/compositionupdate). */
	update(core: EditorCore, text: string): void
	/** Called on compositionend. */
	end(core: EditorCore, finalText: string): void
	/** Force cancel (e.g., on replace-document). */
	cancel(core: EditorCore): void
	/** Whether composition is currently active. */
	isComposing(): boolean
}

export const createCompositionMachine = (): CompositionMachine => {
	let current: CompositionMachineState = { state: 'idle' }

	const machine: CompositionMachine = {
		getState() {
			return current
		},

		start(core: EditorCore) {
			if (current.state !== 'idle') {
				// Already composing — force cancel first
				machine.cancel(core)
			}

			const selections = core.getSelections()
			const sel = selections[0] ?? { anchor: 0, focus: 0 }
			const start = Math.min(sel.anchor, sel.focus)
			const end = Math.max(sel.anchor, sel.focus)
			const originalText = start < end ? core.getTextRange(start, end) : ''

			current = {
				state: 'composing',
				rangeStart: start,
				rangeLength: end - start,
				selectionBefore: { ...sel },
				originalText,
			}
		},

		update(core: EditorCore, text: string) {
			if (current.state !== 'composing') return

			// Replace the current composition range with the new text
			const { rangeStart, rangeLength } = current
			core.dispatch({
				type: 'replace-range',
				start: rangeStart,
				end: rangeStart + rangeLength,
				text,
			})

			// Update the composition range to reflect the new text length
			current = {
				...current,
				rangeLength: text.length,
			}
		},

		end(core: EditorCore, finalText: string) {
			if (current.state !== 'composing') return

			const committing: CompositionCommitting = {
				...current,
				state: 'committing',
			}
			current = committing

			// Apply the final text if it differs from what's already in the range
			const { rangeStart, rangeLength } = committing
			const currentText = core.getTextRange(rangeStart, rangeStart + rangeLength)

			if (currentText !== finalText) {
				core.dispatch({
					type: 'replace-range',
					start: rangeStart,
					end: rangeStart + rangeLength,
					text: finalText,
				})
			}

			// Transition to idle — the entire composition is one undo step
			// because each update replaced the same range.
			current = { state: 'idle' }
		},

		cancel(core: EditorCore) {
			if (current.state !== 'composing') {
				current = { state: 'idle' }
				return
			}

			const cancelled: CompositionCancelled = {
				...current,
				state: 'cancelled',
			}

			// Restore the original text
			core.dispatch({
				type: 'replace-range',
				start: cancelled.rangeStart,
				end: cancelled.rangeStart + cancelled.rangeLength,
				text: cancelled.originalText,
			})

			// Restore the original selection
			core.dispatch({
				type: 'set-selection',
				anchor: cancelled.selectionBefore.anchor,
				focus: cancelled.selectionBefore.focus,
			})

			current = { state: 'idle' }
		},

		isComposing() {
			return current.state === 'composing'
		},
	}

	return machine
}
