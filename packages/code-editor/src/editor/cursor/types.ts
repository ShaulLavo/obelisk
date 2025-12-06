import type { LineEntry } from '../types'

export type CursorPosition = {
	offset: number // absolute position in document
	line: number // 0-based line index
	column: number // 0-based column in line
}

export type SelectionRange = {
	anchor: number // offset where selection started (immovable end)
	focus: number // offset where selection ends (= cursor position)
}

export type CursorState = {
	position: CursorPosition
	preferredColumn: number // for ArrowUp/Down column preservation
	isBlinking: boolean
	selections: SelectionRange[] // empty array = no selection, array for multi-cursor future
}

export type CursorDirection = 'left' | 'right' | 'up' | 'down'

export type CursorNavigationContext = {
	lineEntries: LineEntry[]
	documentLength: number
}

export const createDefaultCursorState = (): CursorState => ({
	position: {
		offset: 0,
		line: 0,
		column: 0
	},
	preferredColumn: 0,
	isBlinking: true,
	selections: []
})

export const createCursorPosition = (
	offset: number,
	line: number,
	column: number
): CursorPosition => ({
	offset,
	line,
	column
})

export const createSelectionRange = (
	anchor: number,
	focus: number
): SelectionRange => ({
	anchor,
	focus
})

// Helper to get normalized selection bounds (start <= end)
export const getSelectionBounds = (
	selection: SelectionRange
): { start: number; end: number } => ({
	start: Math.min(selection.anchor, selection.focus),
	end: Math.max(selection.anchor, selection.focus)
})

// Check if selection is empty (collapsed)
export const isSelectionEmpty = (selection: SelectionRange): boolean =>
	selection.anchor === selection.focus

// Check if cursor has any non-empty selection
export const hasSelection = (state: CursorState): boolean =>
	state.selections.length > 0 && state.selections.some(s => !isSelectionEmpty(s))
