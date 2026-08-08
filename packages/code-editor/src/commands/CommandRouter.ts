/**
 * CommandRouter — translates EditorCommands into EditorTransactions.
 *
 * This keeps browser quirks (in InputController) separate from
 * command semantics (here) and state mutation (in EditorCore).
 *
 * Framework-free. No DOM dependencies.
 */

import type { EditorCommand } from './EditorCommand'
import type { EditorCore, EditorTransaction, AtomicEdit, DispatchResult } from '../core/types'

export type CommandRouterConfig = {
	core: EditorCore
	tabSize: number
	/** Called when copy/cut needs to write to clipboard. */
	onClipboardWrite?: (text: string) => void
	/** Called on save command. */
	onSave?: () => void
}

export type CommandRouter = {
	execute(command: EditorCommand): DispatchResult | null
}

export const createCommandRouter = (config: CommandRouterConfig): CommandRouter => {
	const { core, tabSize, onClipboardWrite, onSave } = config

	const getSelectedText = (): string => {
		const selections = core.getSelections()
		const sel = selections[0]
		if (!sel) return ''
		const start = Math.min(sel.anchor, sel.focus)
		const end = Math.max(sel.anchor, sel.focus)
		if (start === end) return ''
		return core.getTextRange(start, end)
	}

	const findLineRange = (
		start: number,
		end: number,
		lineStarts: number[],
		lineCount: number
	): { startLine: number; endLine: number } => {
		let startLine = 0
		let endLine = 0
		for (let i = 0; i < lineCount; i++) {
			const ls = lineStarts[i] ?? 0
			if (ls <= start) startLine = i
			if (ls <= end) endLine = i
		}
		return { startLine, endLine }
	}

	const buildIndentEdits = (): AtomicEdit[] => {
		const selections = core.getSelections()
		const sel = selections[0]
		if (!sel) return []
		const start = Math.min(sel.anchor, sel.focus)
		const end = Math.max(sel.anchor, sel.focus)

		const snapshot = core.getSnapshot()
		const lineStarts = snapshot.document.lineStarts

		// If no selection, just insert a tab at cursor
		if (start === end) {
			return [{ start, end: start, text: '\t' }]
		}

		// Multi-line: indent each line
		const { startLine, endLine } = findLineRange(start, end, lineStarts, lineStarts.length)
		const edits: AtomicEdit[] = []
		for (let i = startLine; i <= endLine; i++) {
			const lineStart = lineStarts[i] ?? 0
			edits.push({ start: lineStart, end: lineStart, text: '\t' })
		}
		return edits
	}

	const buildDedentEdits = (): AtomicEdit[] => {
		const selections = core.getSelections()
		const sel = selections[0]
		if (!sel) return []
		const start = Math.min(sel.anchor, sel.focus)
		const end = Math.max(sel.anchor, sel.focus)

		const snapshot = core.getSnapshot()
		const lineStarts = snapshot.document.lineStarts

		const { startLine, endLine } = findLineRange(start, end, lineStarts, lineStarts.length)
		const edits: AtomicEdit[] = []
		for (let i = startLine; i <= endLine; i++) {
			const lineText = core.getLineText(i)
			const lineStart = lineStarts[i] ?? 0
			if (lineText.startsWith('\t')) {
				edits.push({ start: lineStart, end: lineStart + 1, text: '' })
			} else {
				// Remove up to tabSize spaces
				let spacesToRemove = 0
				for (let j = 0; j < tabSize && j < lineText.length; j++) {
					if (lineText[j] === ' ') spacesToRemove++
					else break
				}
				if (spacesToRemove > 0) {
					edits.push({ start: lineStart, end: lineStart + spacesToRemove, text: '' })
				}
			}
		}
		return edits
	}

	return {
		execute(command: EditorCommand): DispatchResult | null {
			let tx: EditorTransaction | null = null

			switch (command.type) {
				case 'insert-text':
					tx = { type: 'insert-text', text: command.text }
					break

				case 'insert-newline':
					tx = { type: 'insert-text', text: '\n' }
					break

				case 'delete-backward':
					tx = { type: 'delete-backward', byWord: command.byWord }
					break

				case 'delete-forward':
					tx = { type: 'delete-forward', byWord: command.byWord }
					break

				case 'move-cursor':
					tx = {
						type: 'move-cursor',
						direction: command.direction,
						byWord: command.byWord,
						extend: command.extend,
					}
					break

				case 'move-cursor-home':
					tx = {
						type: 'move-cursor-home',
						extend: command.extend,
						toDocument: command.toDocument,
					}
					break

				case 'move-cursor-end':
					tx = {
						type: 'move-cursor-end',
						extend: command.extend,
						toDocument: command.toDocument,
					}
					break

				case 'move-cursor-page':
					tx = {
						type: 'move-cursor-page',
						direction: command.direction,
						// Use a reasonable default; the actual visible lines
						// should be provided by the view layer in production.
						visibleLines: 30,
						extend: command.extend,
					}
					break

				case 'select-all':
					tx = { type: 'select-all' }
					break

				case 'undo':
					tx = { type: 'undo' }
					break

				case 'redo':
					tx = { type: 'redo' }
					break

				case 'copy': {
					const text = getSelectedText()
					if (text && onClipboardWrite) {
						onClipboardWrite(text)
					}
					return null // copy doesn't dispatch a transaction
				}

				case 'cut': {
					const text = getSelectedText()
					if (text && onClipboardWrite) {
						onClipboardWrite(text)
					}
					if (text) {
						tx = { type: 'delete-backward', byWord: false }
					}
					break
				}

				case 'paste':
					if (command.text) {
						tx = { type: 'insert-text', text: command.text }
					}
					break

				case 'indent': {
					const edits = buildIndentEdits()
					if (edits.length === 0) return null
					if (edits.length === 1 && edits[0]!.start === edits[0]!.end) {
						// Single cursor, no selection — insert tab
						tx = { type: 'insert-text', text: edits[0]!.text }
					} else {
						tx = { type: 'apply-edits', edits }
					}
					break
				}

				case 'dedent': {
					const edits = buildDedentEdits()
					if (edits.length === 0) return null
					tx = { type: 'apply-edits', edits }
					break
				}

				case 'save':
					onSave?.()
					return null // save doesn't dispatch a transaction
			}

			if (tx) {
				return core.dispatch(tx)
			}
			return null
		},
	}
}
