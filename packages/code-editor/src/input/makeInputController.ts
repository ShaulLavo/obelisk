/**
 * makeInputController — owns DOM event interpretation for the editor.
 *
 * Responsibilities:
 * - keydown → command translation via keybinding table
 * - beforeinput/input → text insertion (not per-character keybindings)
 * - compositionstart/update/end → IME state machine
 * - clipboard operations
 * - hidden textarea mirror-window sync around the caret
 *
 * Does NOT own:
 * - direct model mutation (goes through CommandRouter → EditorCore)
 * - DOM painting
 * - highlight updates
 * - pointer hit testing (stays on legacy path until Phase 4)
 */

import type { EditorCore } from '../core/types'
import type { EditorCommand } from '../commands/EditorCommand'
import { type CommandRouter, createCommandRouter } from '../commands/CommandRouter'
import { getBuiltinKeyBindings, matchKeyBinding, type KeyBinding } from '../commands/builtins'
import { createCompositionMachine, type CompositionMachine } from './composition'
import { writeClipboardText, readClipboardText } from './clipboard'

// ---------------------------------------------------------------------------
// Mirror window
// ---------------------------------------------------------------------------

const MIRROR_HALF_WINDOW = 128 // ±128 UTF-16 code units

/**
 * Computes the text and selection offsets for the hidden textarea mirror.
 * The mirror shows a small window of text around the cursor for IME positioning.
 */
const computeMirrorWindow = (
	core: EditorCore
): { text: string; selectionStart: number; selectionEnd: number } => {
	const selections = core.getSelections()
	if (selections.length === 0) return { text: '', selectionStart: 0, selectionEnd: 0 }

	const sel = selections[0]!
	const anchor = Math.min(sel.anchor, sel.focus)
	const focus = Math.max(sel.anchor, sel.focus)
	const docLen = core.getDocumentLength()

	// Window around the selection
	const windowStart = Math.max(0, anchor - MIRROR_HALF_WINDOW)
	const windowEnd = Math.min(docLen, focus + MIRROR_HALF_WINDOW)

	const text = core.getTextRange(windowStart, windowEnd)
	const selectionStart = anchor - windowStart
	const selectionEnd = focus - windowStart

	return { text, selectionStart, selectionEnd }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InputControllerConfig = {
	core: EditorCore
	tabSize: number
	isMac: boolean
	/** Called on save command. */
	onSave?: () => void
}

export type InputController = {
	/** Attach event listeners to the given textarea element. */
	attach(textarea: HTMLTextAreaElement): void
	/** Detach all event listeners. */
	detach(): void
	/** Synchronize the textarea mirror content. Call after dispatch. */
	syncMirror(): void
	/** Access the composition machine for external coordination. */
	getComposition(): CompositionMachine
	/** Access the command router for programmatic command execution. */
	getRouter(): CommandRouter
	/** Tear down. */
	destroy(): void
}

export const makeInputController = (config: InputControllerConfig): InputController => {
	const { core, tabSize, isMac, onSave } = config

	const composition = createCompositionMachine()
	const keyBindings: KeyBinding[] = getBuiltinKeyBindings(isMac)

	const router = createCommandRouter({
		core,
		tabSize,
		onClipboardWrite: (text) => {
			void writeClipboardText(text)
		},
		onSave,
	})

	let textarea: HTMLTextAreaElement | null = null

	// -----------------------------------------------------------------
	// Event handlers
	// -----------------------------------------------------------------

	const handleKeyDown = (e: KeyboardEvent) => {
		// Don't intercept keys during active composition
		if (composition.isComposing()) return

		const command = matchKeyBinding(keyBindings, e)
		if (command) {
			e.preventDefault()
			router.execute(command)
			syncMirror()
		}
	}

	const handleBeforeInput = (e: InputEvent) => {
		const inputType = e.inputType

		// During composition, let the composition machine handle things
		if (composition.isComposing() && inputType !== 'insertFromPaste') {
			return
		}

		switch (inputType) {
			case 'insertText':
			case 'insertReplacementText': {
				if (e.data) {
					e.preventDefault()
					router.execute({ type: 'insert-text', text: e.data })
					syncMirror()
				}
				break
			}

			case 'insertLineBreak':
			case 'insertParagraph': {
				e.preventDefault()
				router.execute({ type: 'insert-newline' })
				syncMirror()
				break
			}

			case 'insertFromPaste': {
				// We handle paste via the data if available, otherwise fallback
				const data = e.dataTransfer?.getData('text/plain') ?? e.data
				if (data) {
					e.preventDefault()
					router.execute({ type: 'paste', text: data })
					syncMirror()
				}
				break
			}

			case 'deleteContentBackward': {
				e.preventDefault()
				router.execute({ type: 'delete-backward', byWord: false })
				syncMirror()
				break
			}

			case 'deleteWordBackward': {
				e.preventDefault()
				router.execute({ type: 'delete-backward', byWord: true })
				syncMirror()
				break
			}

			case 'deleteContentForward': {
				e.preventDefault()
				router.execute({ type: 'delete-forward', byWord: false })
				syncMirror()
				break
			}

			case 'deleteWordForward': {
				e.preventDefault()
				router.execute({ type: 'delete-forward', byWord: true })
				syncMirror()
				break
			}

			case 'deleteSoftLineBackward':
			case 'deleteHardLineBackward': {
				// Delete to line start — handled as word-level for now
				e.preventDefault()
				router.execute({ type: 'delete-backward', byWord: true })
				syncMirror()
				break
			}

			case 'deleteSoftLineForward':
			case 'deleteHardLineForward': {
				e.preventDefault()
				router.execute({ type: 'delete-forward', byWord: true })
				syncMirror()
				break
			}

			// Composition-related inputTypes are handled by the composition events
			case 'insertCompositionText':
				break

			default:
				// Unknown inputType — let browser handle it
				break
		}
	}

	const handleCompositionStart = (_e: CompositionEvent) => {
		composition.start(core)
	}

	const handleCompositionUpdate = (e: CompositionEvent) => {
		if (e.data !== undefined) {
			composition.update(core, e.data)
		}
	}

	const handleCompositionEnd = (e: CompositionEvent) => {
		composition.end(core, e.data ?? '')
		syncMirror()
	}

	const handlePaste = async (e: ClipboardEvent) => {
		// Prefer the data from the ClipboardEvent
		const text = e.clipboardData?.getData('text/plain')
		if (text) {
			e.preventDefault()
			router.execute({ type: 'paste', text })
			syncMirror()
			return
		}

		// Fallback: read from clipboard API
		e.preventDefault()
		const clipText = await readClipboardText()
		if (clipText) {
			router.execute({ type: 'paste', text: clipText })
			syncMirror()
		}
	}

	const handleCopy = (e: ClipboardEvent) => {
		const selections = core.getSelections()
		if (selections.length === 0) return
		const sel = selections[0]!
		const start = Math.min(sel.anchor, sel.focus)
		const end = Math.max(sel.anchor, sel.focus)
		if (start === end) return

		const text = core.getTextRange(start, end)
		e.preventDefault()
		e.clipboardData?.setData('text/plain', text)
	}

	const handleCut = (e: ClipboardEvent) => {
		handleCopy(e)
		router.execute({ type: 'delete-backward', byWord: false })
		syncMirror()
	}

	// -----------------------------------------------------------------
	// Mirror sync
	// -----------------------------------------------------------------

	const syncMirror = () => {
		if (!textarea) return
		const mirror = computeMirrorWindow(core)
		textarea.value = mirror.text
		textarea.setSelectionRange(mirror.selectionStart, mirror.selectionEnd)
	}

	// -----------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------

	return {
		attach(el: HTMLTextAreaElement) {
			textarea = el
			el.addEventListener('keydown', handleKeyDown)
			el.addEventListener('beforeinput', handleBeforeInput as EventListener)
			el.addEventListener('compositionstart', handleCompositionStart)
			el.addEventListener('compositionupdate', handleCompositionUpdate)
			el.addEventListener('compositionend', handleCompositionEnd)
			el.addEventListener('paste', handlePaste as unknown as EventListener)
			el.addEventListener('copy', handleCopy as EventListener)
			el.addEventListener('cut', handleCut as EventListener)
			syncMirror()
		},

		detach() {
			if (!textarea) return
			textarea.removeEventListener('keydown', handleKeyDown)
			textarea.removeEventListener('beforeinput', handleBeforeInput as EventListener)
			textarea.removeEventListener('compositionstart', handleCompositionStart)
			textarea.removeEventListener('compositionupdate', handleCompositionUpdate)
			textarea.removeEventListener('compositionend', handleCompositionEnd)
			textarea.removeEventListener('paste', handlePaste as unknown as EventListener)
			textarea.removeEventListener('copy', handleCopy as EventListener)
			textarea.removeEventListener('cut', handleCut as EventListener)
			textarea = null
		},

		syncMirror,

		getComposition() {
			return composition
		},

		getRouter() {
			return router
		},

		destroy() {
			if (textarea) {
				// Detach is idempotent
				const el = textarea
				textarea = null
				el.removeEventListener('keydown', handleKeyDown)
				el.removeEventListener('beforeinput', handleBeforeInput as EventListener)
				el.removeEventListener('compositionstart', handleCompositionStart)
				el.removeEventListener('compositionupdate', handleCompositionUpdate)
				el.removeEventListener('compositionend', handleCompositionEnd)
				el.removeEventListener('paste', handlePaste as unknown as EventListener)
				el.removeEventListener('copy', handleCopy as EventListener)
				el.removeEventListener('cut', handleCut as EventListener)
			}
		},
	}
}
