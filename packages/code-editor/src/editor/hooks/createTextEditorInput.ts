import { createEffect, createMemo, onCleanup, type Accessor } from 'solid-js'
import type { PieceTableSnapshot } from '@repo/utils'
import {
	createPieceTableSnapshot,
	deleteFromPieceTable,
	insertIntoPieceTable,
} from '@repo/utils'
import {
	createKeymapController,
	type CommandDescriptor,
	type KeybindingOptions,
} from '@repo/keyboard'
import type { DocumentIncrementalEdit } from '../types'
import { useCursor, getSelectionBounds, hasSelection } from '../cursor'
import { useHistory, type HistoryMergeMode } from '../history'
import { clipboard } from '../utils/clipboard'
import { createKeyRepeat } from './createKeyRepeat'
import { describeIncrementalEdit } from '../utils'

type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
type RepeatableDeleteKey = 'Backspace'

type VisibleLineRange = {
	start: number
	end: number
}

type ShortcutConfig = {
	shortcut: string
	options?: KeybindingOptions
}

const KEYMAP_SCOPE_EDITING = 'editor' as const
const KEYMAP_SCOPE_NAVIGATION = 'editor.navigation' as const

export type TextEditorInputOptions = {
	visibleLineRange: Accessor<VisibleLineRange>
	updatePieceTable: (
		updater: (
			current: PieceTableSnapshot | undefined
		) => PieceTableSnapshot | undefined
	) => void
	isFileSelected: Accessor<boolean>
	isEditable: Accessor<boolean>
	getInputElement: () => HTMLTextAreaElement | null
	scrollCursorIntoView: () => void
	activeScopes?: Accessor<string[]>
	onIncrementalEdit?: (edit: DocumentIncrementalEdit) => void
}

export type TextEditorInputHandlers = {
	handleInput: (event: InputEvent) => void
	handleKeyDown: (event: KeyboardEvent) => void
	handleKeyUp: (event: KeyboardEvent) => void
	handleRowClick: (lineIndex: number) => void
	handlePreciseClick: (
		lineIndex: number,
		column: number,
		shiftKey?: boolean
	) => void
	focusInput: () => void
	deleteSelection: () => boolean
}

export function createTextEditorInput(
	options: TextEditorInputOptions
): TextEditorInputHandlers {
	const cursor = useCursor()
	const history = useHistory()
	const focusInput = () => {
		const element = options.getInputElement()
		if (!element) return
		try {
			element.focus({ preventScroll: true })
		} catch {
			element.focus()
		}
	}

	createEffect(() => {
		if (options.isFileSelected()) {
			focusInput()
		}
	})

	const snapshotCursorPosition = () => ({
		offset: cursor.state.position.offset,
		line: cursor.state.position.line,
		column: cursor.state.position.column,
	})

	const snapshotSelection = () => {
		const selection = cursor.actions.getSelection()
		return selection
			? { anchor: selection.anchor, focus: selection.focus }
			: null
	}

	const applyTextChange = (
		start: number,
		end: number,
		insertedText: string,
		changeOptions?: {
			cursorOffsetAfter?: number
			mergeMode?: HistoryMergeMode
		}
	): boolean => {
		if (!options.isEditable()) return false

		const documentLength = cursor.documentLength()
		const normalizedStart = Math.min(start, end)
		const normalizedEnd = Math.max(start, end)
		const clampedStart = Math.max(0, Math.min(normalizedStart, documentLength))
		const clampedEnd = Math.max(
			clampedStart,
			Math.min(normalizedEnd, documentLength)
		)
		const deleteLength = clampedEnd - clampedStart

		if (deleteLength === 0 && insertedText.length === 0) {
			return false
		}

		const deletedText =
			deleteLength > 0 ? cursor.getTextRange(clampedStart, clampedEnd) : ''

		const cursorBefore = snapshotCursorPosition()
		const selectionBefore = snapshotSelection()

		const incrementalEdit =
			options.onIncrementalEdit &&
			describeIncrementalEdit(
				(offset) => {
					const position = cursor.lines.offsetToPosition(offset)
					return {
						row: position.line,
						column: position.column,
					}
				},
				clampedStart,
				deletedText,
				insertedText
			)

		options.updatePieceTable((current) => {
			const baseSnapshot =
				current ??
				createPieceTableSnapshot(
					cursor.getTextRange(0, cursor.documentLength())
				)
			let snapshot = baseSnapshot

			if (deleteLength > 0) {
				snapshot = deleteFromPieceTable(snapshot, clampedStart, deleteLength)
			}

			if (insertedText.length > 0) {
				snapshot = insertIntoPieceTable(snapshot, clampedStart, insertedText)
			}

			return snapshot
		})

		cursor.lines.applyEdit(clampedStart, deletedText, insertedText)

		const cursorOffsetAfter =
			typeof changeOptions?.cursorOffsetAfter === 'number'
				? changeOptions.cursorOffsetAfter
				: insertedText.length > 0
					? clampedStart + insertedText.length
					: clampedStart

		cursor.actions.setCursorOffset(cursorOffsetAfter)

		const cursorAfter = snapshotCursorPosition()
		const selectionAfter = snapshotSelection()

		history.recordChange(
			{
				offset: clampedStart,
				insertedText,
				deletedText,
				cursorBefore,
				cursorAfter,
				selectionBefore,
				selectionAfter,
			},
			{
				mergeMode: changeOptions?.mergeMode,
			}
		)

		if (incrementalEdit) {
			options.onIncrementalEdit?.(incrementalEdit)
		}

		options.scrollCursorIntoView()
		return true
	}

	const applyInsert = (value: string) => {
		if (!value) return
		const offset = cursor.state.position.offset
		applyTextChange(offset, offset, value, {
			cursorOffsetAfter: offset + value.length,
			mergeMode: 'insert',
		})
	}

	const deleteSelection = (): boolean => {
		if (!options.isEditable()) return false
		const state = cursor.state
		if (!hasSelection(state)) return false

		const selection = state.selections[0]
		if (!selection) return false

		const { start, end } = getSelectionBounds(selection)
		return applyTextChange(start, end, '', {
			cursorOffsetAfter: start,
		})
	}

	function performDelete(key: 'Backspace' | 'Delete', ctrlOrMeta = false) {
		if (ctrlOrMeta && !cursor.actions.hasSelection()) {
			if (key === 'Backspace') {
				cursor.actions.moveCursor('left', true, true)
			} else {
				cursor.actions.moveCursor('right', true, true)
			}
		}

		if (deleteSelection()) {
			return
		}

		const offset = cursor.state.position.offset

		if (key === 'Backspace') {
			if (offset === 0) return
			applyTextChange(offset - 1, offset, '', {
				cursorOffsetAfter: offset - 1,
				mergeMode: 'delete',
			})
		} else {
			if (offset >= cursor.documentLength()) return
			applyTextChange(offset, offset + 1, '', {
				cursorOffsetAfter: offset,
				mergeMode: 'delete',
			})
		}
	}

	const handleInput = (event: InputEvent) => {
		console.log(
			'[handleInput] inputType:',
			event.inputType,
			'data:',
			event.data
		)
		if (!options.isEditable()) {
			console.log('[handleInput] Not editable, returning')
			return
		}
		const target = event.target as HTMLTextAreaElement | null
		if (!target) {
			console.log('[handleInput] No target, returning')
			return
		}
		const value = target.value
		console.log(
			'[handleInput] value:',
			JSON.stringify(value),
			'length:',
			value.length
		)
		if (!value) {
			console.log('[handleInput] Empty value, returning')
			return
		}

		const deletedSelection = deleteSelection()
		console.log('[handleInput] deletedSelection:', deletedSelection)

		applyInsert(value)
		target.value = ''
		console.log('[handleInput] Completed, cleared target.value')
	}

	const keymap = createKeymapController()
	const keymapDisposers: Array<() => void> = []

	const registerCommandWithShortcuts = (
		command: Pick<CommandDescriptor<unknown>, 'id' | 'run'>,
		shortcuts: ShortcutConfig[],
		scope: string = KEYMAP_SCOPE_EDITING
	) => {
		const disposeCommand = keymap.registerCommand(command)
		keymapDisposers.push(disposeCommand)

		for (const shortcut of shortcuts) {
			const binding = keymap.registerKeybinding({
				shortcut: shortcut.shortcut,
				options: {
					preventDefault: true,
					...shortcut.options,
				},
			})
			keymapDisposers.push(binding.dispose)

			const disposeBinding = keymap.bindCommand({
				scope,
				bindingId: binding.id,
				commandId: command.id,
			})
			keymapDisposers.push(disposeBinding)
		}
	}

	const activeScopes = createMemo(() => {
		const extraScopes = options.activeScopes?.() ?? []
		const editable = options.isEditable()
		const baseScopes = editable
			? [KEYMAP_SCOPE_NAVIGATION, KEYMAP_SCOPE_EDITING]
			: [KEYMAP_SCOPE_NAVIGATION]

		return extraScopes.length > 0
			? Array.from(new Set([...baseScopes, ...extraScopes]))
			: baseScopes
	})

	createEffect(() => {
		keymap.setActiveScopes(activeScopes())
	})

	onCleanup(() => {
		for (const dispose of keymapDisposers) {
			dispose()
		}
	})

	registerCommandWithShortcuts(
		{
			id: 'editor.selectAll',
			run: () => {
				cursor.actions.selectAll()
			},
		},
		[{ shortcut: 'primary+a' }],
		KEYMAP_SCOPE_NAVIGATION
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.copySelection',
			run: () => {
				const selectedText = cursor.actions.getSelectedText()
				if (selectedText) {
					void clipboard.writeText(selectedText)
				}
			},
		},
		[{ shortcut: 'primary+c' }],
		KEYMAP_SCOPE_NAVIGATION
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cutSelection',
			run: () => {
				const selectedText = cursor.actions.getSelectedText()
				if (selectedText) {
					void clipboard.writeText(selectedText)
				}
				deleteSelection()
			},
		},
		[{ shortcut: 'primary+x' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.paste',
			run: () => {
				if (!options.isEditable()) return
				return clipboard.readText().then((text) => {
					if (text && options.isEditable()) {
						deleteSelection()
						applyInsert(text)
					}
				})
			},
		},
		[{ shortcut: 'primary+v' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.undo',
			run: () => {
				if (!options.isEditable()) return
				history.undo()
				options.scrollCursorIntoView()
			},
		},
		[{ shortcut: 'primary+z' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.redo',
			run: () => {
				if (!options.isEditable()) return
				history.redo()
				options.scrollCursorIntoView()
			},
		},
		[{ shortcut: 'primary+shift+z' }, { shortcut: 'primary+y' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.tab',
			run: () => {
				if (!options.isEditable()) return
				deleteSelection()
				applyInsert('\t')
			},
		},
		[{ shortcut: 'tab' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.deleteKey',
			run: (context) => {
				if (!options.isEditable()) return
				const key = context.event.key === 'Backspace' ? 'Backspace' : 'Delete'
				const ctrlOrMeta = context.event.ctrlKey || context.event.metaKey
				performDelete(key, ctrlOrMeta)
			},
		},
		[{ shortcut: 'delete' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cursor.home',
			run: (context) => {
				const ctrlOrMeta = context.event.ctrlKey || context.event.metaKey
				cursor.actions.moveCursorHome(ctrlOrMeta, context.event.shiftKey)
				options.scrollCursorIntoView()
			},
		},
		[{ shortcut: 'home' }, { shortcut: 'primary+home' }],
		KEYMAP_SCOPE_NAVIGATION
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cursor.end',
			run: (context) => {
				const ctrlOrMeta = context.event.ctrlKey || context.event.metaKey
				cursor.actions.moveCursorEnd(ctrlOrMeta, context.event.shiftKey)
				options.scrollCursorIntoView()
			},
		},
		[{ shortcut: 'end' }, { shortcut: 'primary+end' }],
		KEYMAP_SCOPE_NAVIGATION
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cursor.pageUp',
			run: (context) => {
				const range = options.visibleLineRange()
				const visibleLines = Math.max(1, range.end - range.start + 1)
				cursor.actions.moveCursorByLines(-visibleLines, context.event.shiftKey)
				options.scrollCursorIntoView()
			},
		},
		[{ shortcut: 'pageup' }],
		KEYMAP_SCOPE_NAVIGATION
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cursor.pageDown',
			run: (context) => {
				const range = options.visibleLineRange()
				const visibleLines = Math.max(1, range.end - range.start + 1)
				cursor.actions.moveCursorByLines(visibleLines, context.event.shiftKey)
				options.scrollCursorIntoView()
			},
		},
		[{ shortcut: 'pagedown' }],
		KEYMAP_SCOPE_NAVIGATION
	)

	const deleteKeyRepeat = createKeyRepeat<RepeatableDeleteKey>(
		(key, ctrlOrMeta) => {
			performDelete(key, ctrlOrMeta)
		}
	)

	const keyRepeat = createKeyRepeat<ArrowKey>((key, ctrlOrMeta, shiftKey) => {
		switch (key) {
			case 'ArrowLeft':
				cursor.actions.moveCursor('left', ctrlOrMeta, shiftKey)
				break
			case 'ArrowRight':
				cursor.actions.moveCursor('right', ctrlOrMeta, shiftKey)
				break
			case 'ArrowUp':
				cursor.actions.moveCursor('up', false, shiftKey)
				break
			case 'ArrowDown':
				cursor.actions.moveCursor('down', false, shiftKey)
				break
		}
		options.scrollCursorIntoView()
	})

	const handleKeyDown = (event: KeyboardEvent) => {
		const ctrlOrMeta = event.ctrlKey || event.metaKey
		const shiftKey = event.shiftKey
		const editable = options.isEditable()

		if (event.key === 'Backspace') {
			if (!editable) return
			event.preventDefault()
			if (!event.repeat && !deleteKeyRepeat.isActive('Backspace')) {
				deleteKeyRepeat.start('Backspace', ctrlOrMeta, shiftKey)
			}
			return
		}

		if (
			event.key === 'ArrowLeft' ||
			event.key === 'ArrowRight' ||
			event.key === 'ArrowUp' ||
			event.key === 'ArrowDown'
		) {
			event.preventDefault()
			if (!event.repeat && !keyRepeat.isActive(event.key as ArrowKey)) {
				keyRepeat.start(event.key as ArrowKey, ctrlOrMeta, shiftKey)
			}
			return
		}

		if (keymap.handleKeydown(event)) {
			return
		}
	}

	const handleKeyUp = (event: KeyboardEvent) => {
		if (event.key === 'Backspace' && deleteKeyRepeat.isActive('Backspace')) {
			deleteKeyRepeat.stop()
		}

		if (
			event.key === 'ArrowLeft' ||
			event.key === 'ArrowRight' ||
			event.key === 'ArrowUp' ||
			event.key === 'ArrowDown'
		) {
			if (keyRepeat.isActive(event.key as ArrowKey)) {
				keyRepeat.stop()
			}
		}
	}

	const handleRowClick = (lineIndex: number) => {
		const textLength = cursor.lines.getLineTextLength(lineIndex)
		cursor.actions.setCursorFromClick(lineIndex, textLength)
		focusInput()
	}

	const handlePreciseClick = (
		lineIndex: number,
		column: number,
		shiftKey = false
	) => {
		cursor.actions.setCursorFromClick(lineIndex, column, shiftKey)
		focusInput()
	}

	return {
		handleInput,
		handleKeyDown,
		handleKeyUp,
		handleRowClick,
		handlePreciseClick,
		focusInput,
		deleteSelection,
	}
}
