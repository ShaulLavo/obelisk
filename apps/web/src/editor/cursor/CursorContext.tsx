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
import type { CursorPosition, CursorState, CursorDirection } from './types'
import { createDefaultCursorState, createCursorPosition } from './types'
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
	setCursor: (position: CursorPosition) => void
	setCursorOffset: (offset: number) => void
	moveCursor: (direction: CursorDirection, ctrlKey?: boolean) => void
	moveCursorByLines: (delta: number) => void
	moveCursorHome: (ctrlKey?: boolean) => void
	moveCursorEnd: (ctrlKey?: boolean) => void
	setCursorFromClick: (lineIndex: number, column: number) => void
	resetCursor: () => void
	setBlinking: (blinking: boolean) => void
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
	// Store cursor states per file path
	const [cursorStates, setCursorStates] = createStore<
		Record<string, CursorState>
	>({})

	// Reactive memo for current file path
	const currentPath = createMemo(() => props.filePath())

	// Reactive memo for current cursor state
	const currentState = createMemo((): CursorState => {
		const path = currentPath()
		if (!path) {
			return createDefaultCursorState()
		}
		return cursorStates[path] ?? createDefaultCursorState()
	})

	// Update cursor state for current file
	const updateCurrentState = (
		updater: (prev: CursorState) => Partial<CursorState>
	) => {
		const path = currentPath()
		if (!path) return

		const current = cursorStates[path] ?? createDefaultCursorState()
		const updates = updater(current)
		setCursorStates(path, { ...current, ...updates })
	}

	// Initialize cursor state when file changes
	createEffect(
		on(currentPath, path => {
			if (!path) return
			if (!cursorStates[path]) {
				setCursorStates(path, createDefaultCursorState())
			}
		})
	)

	// Clamp cursor when document length changes (e.g., after edits)
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

	const actions: CursorActions = {
		setCursor: (position: CursorPosition) => {
			updateCurrentState(() => ({
				position,
				preferredColumn: position.column
			}))
		},

		setCursorOffset: (offset: number) => {
			const entries = props.lineEntries()
			const position = offsetToPosition(offset, entries)
			updateCurrentState(() => ({
				position,
				preferredColumn: position.column
			}))
		},

		moveCursor: (direction: CursorDirection, ctrlKey = false) => {
			const state = currentState()
			const entries = props.lineEntries()
			const text = props.documentText()
			const length = props.documentLength()

			if (direction === 'left') {
				if (ctrlKey) {
					const newPosition = moveByWord(state.position, 'left', text, entries)
					updateCurrentState(() => ({
						position: newPosition,
						preferredColumn: newPosition.column
					}))
				} else {
					const newPosition = moveCursorLeft(state.position, entries)
					updateCurrentState(() => ({
						position: newPosition,
						preferredColumn: newPosition.column
					}))
				}
			} else if (direction === 'right') {
				if (ctrlKey) {
					const newPosition = moveByWord(state.position, 'right', text, entries)
					updateCurrentState(() => ({
						position: newPosition,
						preferredColumn: newPosition.column
					}))
				} else {
					const newPosition = moveCursorRight(state.position, length, entries)
					updateCurrentState(() => ({
						position: newPosition,
						preferredColumn: newPosition.column
					}))
				}
			} else if (direction === 'up' || direction === 'down') {
				const result = moveVertically(
					state.position,
					direction,
					state.preferredColumn,
					entries
				)
				updateCurrentState(() => ({
					position: result.position,
					preferredColumn: result.preferredColumn
				}))
			}
		},

		moveCursorByLines: (delta: number) => {
			const state = currentState()
			const entries = props.lineEntries()

			const result = moveByLines(
				state.position,
				delta,
				state.preferredColumn,
				entries
			)
			updateCurrentState(() => ({
				position: result.position,
				preferredColumn: result.preferredColumn
			}))
		},

		moveCursorHome: (ctrlKey = false) => {
			const state = currentState()
			const entries = props.lineEntries()

			const newPosition = ctrlKey
				? moveToDocStart()
				: moveToLineStart(state.position, entries)

			updateCurrentState(() => ({
				position: newPosition,
				preferredColumn: newPosition.column
			}))
		},

		moveCursorEnd: (ctrlKey = false) => {
			const state = currentState()
			const entries = props.lineEntries()

			const newPosition = ctrlKey
				? moveToDocEnd(entries)
				: moveToLineEnd(state.position, entries)

			updateCurrentState(() => ({
				position: newPosition,
				preferredColumn: newPosition.column
			}))
		},

		setCursorFromClick: (lineIndex: number, column: number) => {
			const entries = props.lineEntries()
			if (entries.length === 0) return

			const offset = positionToOffset(lineIndex, column, entries)
			const position = createCursorPosition(offset, lineIndex, column)

			updateCurrentState(() => ({
				position,
				preferredColumn: column
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
		}
	}

	const value: CursorContextValue = {
		get state() {
			return currentState()
		},
		actions,
		lineEntries: props.lineEntries,
		documentText: props.documentText,
		documentLength: props.documentLength
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
