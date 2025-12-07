import { createEffect, onCleanup, type Accessor } from 'solid-js'
import type { PieceTableSnapshot } from '@repo/utils'
import {
	createPieceTableSnapshot,
	deleteFromPieceTable,
	getPieceTableLength,
	insertIntoPieceTable
} from '@repo/utils'
import {
	createKeymapController,
	type CommandDescriptor,
	type KeybindingOptions
} from '@repo/keyboard'
import type { LineEntry } from '../types'
import { useCursor, getSelectionBounds, hasSelection } from '../cursor'
import { clipboard } from '../utils/clipboard'
import { createKeyRepeat } from './createKeyRepeat'

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

const KEYMAP_SCOPE = 'editor' as const

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
}

export type TextEditorInputHandlers = {
	handleInput: (event: InputEvent) => void
	handleKeyDown: (event: KeyboardEvent) => void
	handleKeyUp: (event: KeyboardEvent) => void
	handleRowClick: (entry: LineEntry) => void
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
	const focusInput = () => {
		if (!options.isEditable()) return
		const element = options.getInputElement()
		if (!element) return
		try {
			element.focus({ preventScroll: true })
		} catch {
			element.focus()
		}
	}

	createEffect(() => {
		if (options.isFileSelected() && options.isEditable()) {
			focusInput()
		}
	})

	const applyInsert = (value: string) => {
		if (!value) return
		const offset = cursor.state.position.offset
		options.updatePieceTable(current => {
			const baseSnapshot =
				current ?? createPieceTableSnapshot(cursor.documentText())
			return insertIntoPieceTable(baseSnapshot, offset, value)
		})
		cursor.actions.setCursorOffset(offset + value.length)
		options.scrollCursorIntoView()
	}

	const applyDelete = (offset: number, length: number) => {
		if (length <= 0 || offset < 0) return
		options.updatePieceTable(current => {
			const baseSnapshot =
				current ?? createPieceTableSnapshot(cursor.documentText())
			const totalLength = getPieceTableLength(baseSnapshot)

			if (offset >= totalLength) {
				return baseSnapshot
			}

			const clampedLength = Math.max(0, Math.min(length, totalLength - offset))

			if (clampedLength === 0) {
				return baseSnapshot
			}

			return deleteFromPieceTable(baseSnapshot, offset, clampedLength)
		})
	}

	const deleteSelection = (): boolean => {
		if (!options.isEditable()) return false
		const state = cursor.state
		if (!hasSelection(state)) return false

		const selection = state.selections[0]
		if (!selection) return false

		const { start, end } = getSelectionBounds(selection)
		const length = end - start

		applyDelete(start, length)
		cursor.actions.setCursorOffset(start)
		return true
	}

	function performDelete(
		key: 'Backspace' | 'Delete',
		ctrlOrMeta = false,
		_shiftKey = false
	) {
		if (ctrlOrMeta && !cursor.actions.hasSelection()) {
			if (key === 'Backspace') {
				cursor.actions.moveCursor('left', true, true)
			} else {
				cursor.actions.moveCursor('right', true, true)
			}
		}

		if (deleteSelection()) {
			options.scrollCursorIntoView()
			return
		}

		const offset = cursor.state.position.offset

		if (key === 'Backspace') {
			if (offset === 0) return
			applyDelete(offset - 1, 1)
			cursor.actions.setCursorOffset(offset - 1)
		} else {
			applyDelete(offset, 1)
		}

		options.scrollCursorIntoView()
	}

	const handleInput = (event: InputEvent) => {
		if (!options.isEditable()) return
		const target = event.target as HTMLTextAreaElement | null
		if (!target) return
		const value = target.value
		if (!value) return

		deleteSelection()

		applyInsert(value)
		target.value = ''
	}

	const keymap = createKeymapController()
	const keymapDisposers: Array<() => void> = []

	const registerCommandWithShortcuts = (
		command: Pick<CommandDescriptor<unknown>, 'id' | 'run'>,
		shortcuts: ShortcutConfig[]
	) => {
		const disposeCommand = keymap.registerCommand(command)
		keymapDisposers.push(disposeCommand)

		for (const shortcut of shortcuts) {
			const binding = keymap.registerKeybinding({
				shortcut: shortcut.shortcut,
				options: {
					preventDefault: true,
					...shortcut.options
				}
			})
			keymapDisposers.push(binding.dispose)

			const disposeBinding = keymap.bindCommand({
				scope: KEYMAP_SCOPE,
				bindingId: binding.id,
				commandId: command.id
			})
			keymapDisposers.push(disposeBinding)
		}
	}

	createEffect(() => {
		const scopes = options.activeScopes?.()
		if (scopes && scopes.length > 0) {
			keymap.setActiveScopes(scopes)
			return
		}
		keymap.setActiveScopes([KEYMAP_SCOPE])
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
			}
		},
		[{ shortcut: 'primary+a' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.copySelection',
			run: () => {
				const selectedText = cursor.actions.getSelectedText()
				if (selectedText) {
					void clipboard.writeText(selectedText)
				}
			}
		},
		[{ shortcut: 'primary+c' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cutSelection',
			run: () => {
				const selectedText = cursor.actions.getSelectedText()
				if (selectedText) {
					void clipboard.writeText(selectedText)
				}
				if (deleteSelection()) {
					options.scrollCursorIntoView()
				}
			}
		},
		[{ shortcut: 'primary+x' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.paste',
			run: () =>
				clipboard.readText().then(text => {
					if (text) {
						deleteSelection()
						applyInsert(text)
					}
				})
		},
		[{ shortcut: 'primary+v' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.tab',
			run: () => {
				deleteSelection()
				applyInsert('\t')
			}
		},
		[{ shortcut: 'tab' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.deleteKey',
			run: context => {
				const key = context.event.key === 'Backspace' ? 'Backspace' : 'Delete'
				const ctrlOrMeta = context.event.ctrlKey || context.event.metaKey
				performDelete(key, ctrlOrMeta, context.event.shiftKey)
			}
		},
		[{ shortcut: 'delete' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cursor.home',
			run: context => {
				const ctrlOrMeta = context.event.ctrlKey || context.event.metaKey
				cursor.actions.moveCursorHome(
					ctrlOrMeta,
					context.event.shiftKey
				)
				options.scrollCursorIntoView()
			}
		},
		[
			{ shortcut: 'home' },
			{ shortcut: 'primary+home' }
		]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cursor.end',
			run: context => {
				const ctrlOrMeta = context.event.ctrlKey || context.event.metaKey
				cursor.actions.moveCursorEnd(
					ctrlOrMeta,
					context.event.shiftKey
				)
				options.scrollCursorIntoView()
			}
		},
		[
			{ shortcut: 'end' },
			{ shortcut: 'primary+end' }
		]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cursor.pageUp',
			run: context => {
				const range = options.visibleLineRange()
				const visibleLines = range.end - range.start
				cursor.actions.moveCursorByLines(
					-visibleLines,
					context.event.shiftKey
				)
				options.scrollCursorIntoView()
			}
		},
		[{ shortcut: 'pageup' }]
	)

	registerCommandWithShortcuts(
		{
			id: 'editor.cursor.pageDown',
			run: context => {
				const range = options.visibleLineRange()
				const visibleLines = range.end - range.start
				cursor.actions.moveCursorByLines(
					visibleLines,
					context.event.shiftKey
				)
				options.scrollCursorIntoView()
			}
		},
		[{ shortcut: 'pagedown' }]
	)

	const deleteKeyRepeat = createKeyRepeat<RepeatableDeleteKey>(
		(key, ctrlOrMeta, shiftKey) => {
			performDelete(key, ctrlOrMeta, shiftKey)
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
		if (!options.isEditable()) return
		const ctrlOrMeta = event.ctrlKey || event.metaKey
		const shiftKey = event.shiftKey

		if (event.key === 'Backspace') {
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
		if (!options.isEditable()) return
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

	const handleRowClick = (entry: LineEntry) => {
		if (!options.isEditable()) return
		cursor.actions.setCursorFromClick(entry.index, entry.text.length)
		focusInput()
	}

	const handlePreciseClick = (
		lineIndex: number,
		column: number,
		shiftKey = false
	) => {
		if (!options.isEditable()) return
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
		deleteSelection
	}
}
