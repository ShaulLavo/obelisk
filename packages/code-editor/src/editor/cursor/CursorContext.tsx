import {
	createContext,
	useContext,
	type JSX,
	createEffect,
	on,
	createMemo
} from 'solid-js'
import { createStore } from 'solid-js/store'
import type { LineEntry } from '../types'
import type {
	CursorPosition,
	CursorState,
	CursorDirection,
	SelectionRange
} from './types'
import {
	createDefaultCursorState,
	createCursorPosition,
	createSelectionRange,
	getSelectionBounds,
	hasSelection
} from './types'
import {
	offsetToPosition,
	positionToOffset,
	moveCursorLeft,
	moveCursorRight,
	moveVertically,
	moveByLines,
	moveToLineStart,
	moveToLineEnd,
	moveToDocStart,
	moveToDocEnd,
	moveByWord
} from './cursorUtils'

export type CursorActions = {
	// Cursor positioning
	setCursor: (position: CursorPosition) => void
	setCursorOffset: (offset: number) => void
	moveCursor: (
		direction: CursorDirection,
		ctrlKey?: boolean,
		shiftKey?: boolean
	) => void
	moveCursorByLines: (delta: number, shiftKey?: boolean) => void
	moveCursorHome: (ctrlKey?: boolean, shiftKey?: boolean) => void
	moveCursorEnd: (ctrlKey?: boolean, shiftKey?: boolean) => void
	setCursorFromClick: (
		lineIndex: number,
		column: number,
		shiftKey?: boolean
	) => void
	resetCursor: () => void
	setBlinking: (blinking: boolean) => void

	// Selection actions
	setSelection: (anchor: number, focus: number) => void
	clearSelection: () => void
	selectAll: () => void
	selectWord: (offset: number) => void
	selectLine: (lineIndex: number) => void
	getSelectedText: () => string
	getSelection: () => SelectionRange | null
	hasSelection: () => boolean
}

export type CursorContextValue = {
	state: CursorState
	actions: CursorActions
	lineEntries: () => LineEntry[]
	documentText: () => string
	documentLength: () => number
}

const CursorContext = createContext<CursorContextValue>()

export type CursorProviderProps = {
	children: JSX.Element
	filePath: () => string | undefined
	lineEntries: () => LineEntry[]
	documentText: () => string
	documentLength: () => number
}

export function CursorProvider(props: CursorProviderProps) {
	const [cursorStates, setCursorStates] = createStore<
		Record<string, CursorState>
	>({})

	const currentPath = createMemo(() => props.filePath())

	const currentState = createMemo((): CursorState => {
		const path = currentPath()
		if (!path) {
			return createDefaultCursorState()
		}
		return cursorStates[path] ?? createDefaultCursorState()
	})

	const updateCurrentState = (
		updater: (prev: CursorState) => Partial<CursorState>
	) => {
		const path = currentPath()
		if (!path) return

		const current = cursorStates[path] ?? createDefaultCursorState()
		const updates = updater(current)
		setCursorStates(path, { ...current, ...updates })
	}

	createEffect(
		on(currentPath, path => {
			if (!path) return
			if (!cursorStates[path]) {
				setCursorStates(path, createDefaultCursorState())
			}
		})
	)

	createEffect(
		on(
			() => props.documentLength(),
			length => {
				const state = currentState()
				if (state.position.offset > length) {
					const newPosition = offsetToPosition(length, props.lineEntries())
					updateCurrentState(() => ({
						position: newPosition,
						preferredColumn: newPosition.column
					}))
				}
			}
		)
	)

	// Helper to get or initialize anchor for selection
	const getSelectionAnchor = (state: CursorState): number => {
		const firstSelection = state.selections[0]
		if (firstSelection) {
			return firstSelection.anchor
		}
		return state.position.offset
	}

	const actions: CursorActions = {
		setCursor: (position: CursorPosition) => {
			updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [] // Clear selection
			}))
		},

		setCursorOffset: (offset: number) => {
			const entries = props.lineEntries()
			const position = offsetToPosition(offset, entries)
			updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [] // Clear selection
			}))
		},

		moveCursor: (
			direction: CursorDirection,
			ctrlKey = false,
			shiftKey = false
		) => {
			const state = currentState()
			const entries = props.lineEntries()
			const text = props.documentText()
			const length = props.documentLength()

			// Get anchor for selection (current position if no selection exists)
			const anchor = shiftKey ? getSelectionAnchor(state) : 0

			let newPosition: CursorPosition
			let newPreferredColumn: number

			if (direction === 'left') {
				newPosition = ctrlKey
					? moveByWord(state.position, 'left', text, entries)
					: moveCursorLeft(state.position, entries)
				newPreferredColumn = newPosition.column
			} else if (direction === 'right') {
				newPosition = ctrlKey
					? moveByWord(state.position, 'right', text, entries)
					: moveCursorRight(state.position, length, entries)
				newPreferredColumn = newPosition.column
			} else {
				// up or down
				const result = moveVertically(
					state.position,
					direction,
					state.preferredColumn,
					entries
				)
				newPosition = result.position
				newPreferredColumn = result.preferredColumn
			}

			updateCurrentState(() => ({
				position: newPosition,
				preferredColumn: newPreferredColumn,
				selections: shiftKey
					? [createSelectionRange(anchor, newPosition.offset)]
					: []
			}))
		},

		moveCursorByLines: (delta: number, shiftKey = false) => {
			const state = currentState()
			const entries = props.lineEntries()
			const anchor = shiftKey ? getSelectionAnchor(state) : 0

			const result = moveByLines(
				state.position,
				delta,
				state.preferredColumn,
				entries
			)
			updateCurrentState(() => ({
				position: result.position,
				preferredColumn: result.preferredColumn,
				selections: shiftKey
					? [createSelectionRange(anchor, result.position.offset)]
					: []
			}))
		},

		moveCursorHome: (ctrlKey = false, shiftKey = false) => {
			const state = currentState()
			const entries = props.lineEntries()
			const anchor = shiftKey ? getSelectionAnchor(state) : 0

			const newPosition = ctrlKey
				? moveToDocStart()
				: moveToLineStart(state.position, entries)

			updateCurrentState(() => ({
				position: newPosition,
				preferredColumn: newPosition.column,
				selections: shiftKey
					? [createSelectionRange(anchor, newPosition.offset)]
					: []
			}))
		},

		moveCursorEnd: (ctrlKey = false, shiftKey = false) => {
			const state = currentState()
			const entries = props.lineEntries()
			const anchor = shiftKey ? getSelectionAnchor(state) : 0

			const newPosition = ctrlKey
				? moveToDocEnd(entries)
				: moveToLineEnd(state.position, entries)

			updateCurrentState(() => ({
				position: newPosition,
				preferredColumn: newPosition.column,
				selections: shiftKey
					? [createSelectionRange(anchor, newPosition.offset)]
					: []
			}))
		},

		setCursorFromClick: (
			lineIndex: number,
			column: number,
			shiftKey = false
		) => {
			const entries = props.lineEntries()
			if (entries.length === 0) return

			const state = currentState()
			const anchor = shiftKey ? getSelectionAnchor(state) : 0

			const offset = positionToOffset(lineIndex, column, entries)
			const position = createCursorPosition(offset, lineIndex, column)

			updateCurrentState(() => ({
				position,
				preferredColumn: column,
				selections: shiftKey
					? [createSelectionRange(anchor, offset)]
					: []
			}))
		},

		resetCursor: () => {
			updateCurrentState(() => createDefaultCursorState())
		},

		setBlinking: (blinking: boolean) => {
			updateCurrentState(prev => ({
				...prev,
				isBlinking: blinking
			}))
		},

		// Selection actions
		setSelection: (anchor: number, focus: number) => {
			const entries = props.lineEntries()
			const position = offsetToPosition(focus, entries)
			updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [createSelectionRange(anchor, focus)]
			}))
		},

		clearSelection: () => {
			updateCurrentState(prev => ({
				...prev,
				selections: []
			}))
		},

		selectAll: () => {
			const length = props.documentLength()
			const entries = props.lineEntries()
			const position = offsetToPosition(length, entries)
			updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [createSelectionRange(0, length)]
			}))
		},

		selectWord: (offset: number) => {
			const text = props.documentText()
			const entries = props.lineEntries()

			// Find word boundaries around offset
			const wordChars = /[\w]/
			let start = offset
			let end = offset

			// Expand left to find word start
			while (start > 0) {
				const char = text[start - 1]
				if (!char || !wordChars.test(char)) break
				start--
			}

			// Expand right to find word end
			while (end < text.length) {
				const char = text[end]
				if (!char || !wordChars.test(char)) break
				end++
			}

			// If no word chars found, select single character (or nothing)
			if (start === end && end < text.length) {
				end++
			}

			const position = offsetToPosition(end, entries)
			updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [createSelectionRange(start, end)]
			}))
		},

		selectLine: (lineIndex: number) => {
			const entries = props.lineEntries()
			if (lineIndex < 0 || lineIndex >= entries.length) return

			const entry = entries[lineIndex]
			if (!entry) return

			const start = entry.start
			// Include the newline character if present
			const end = entry.start + entry.length

			const position = offsetToPosition(end, entries)
			updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [createSelectionRange(start, end)]
			}))
		},

		getSelectedText: () => {
			const state = currentState()
			if (state.selections.length === 0) return ''

			const selection = state.selections[0]
			if (!selection) return ''

			const { start, end } = getSelectionBounds(selection)
			return props.documentText().slice(start, end)
		},

		getSelection: () => {
			const state = currentState()
			const selection = state.selections[0]
			return selection ?? null
		},

		hasSelection: () => {
			return hasSelection(currentState())
		}
	}

	const value: CursorContextValue = {
		get state() {
			return currentState()
		},
		actions,
		lineEntries: () => props.lineEntries(),
		documentText: () => props.documentText(),
		documentLength: () => props.documentLength()
	}

	return (
		<CursorContext.Provider value={value}>
			{props.children}
		</CursorContext.Provider>
	)
}

export function useCursor(): CursorContextValue {
	const ctx = useContext(CursorContext)
	if (!ctx) {
		throw new Error('useCursor must be used within a CursorProvider')
	}
	return ctx
}
