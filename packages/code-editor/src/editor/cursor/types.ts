import type { LineEntry } from '../types'

export type CursorPosition = {
	offset: number // absolute position in document
	line: number // 0-based line index
	column: number // 0-based column in line
}

export type CursorState = {
	position: CursorPosition
	preferredColumn: number // for ArrowUp/Down column preservation
	isBlinking: boolean
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
	isBlinking: true
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
