import type { LineEntry } from '../../types'
import type { CursorPosition } from '../types'
import { offsetToPosition } from './position'

export const isWordChar = (char: string): boolean => {
	return /[\p{L}\p{N}_]/u.test(char)
}

export const findWordBoundaryLeft = (text: string, offset: number): number => {
	if (offset <= 0) return 0

	let pos = offset - 1

	while (pos > 0 && /\s/.test(text[pos]!)) {
		pos--
	}

	if (pos >= 0 && isWordChar(text[pos]!)) {
		while (pos > 0 && isWordChar(text[pos - 1]!)) {
			pos--
		}
	} else if (pos >= 0) {
		while (
			pos > 0 &&
			!isWordChar(text[pos - 1]!) &&
			!/\s/.test(text[pos - 1]!)
		) {
			pos--
		}
	}

	return pos
}

export const findWordBoundaryRight = (text: string, offset: number): number => {
	if (offset >= text.length) return text.length

	let pos = offset

	if (isWordChar(text[pos]!)) {
		while (pos < text.length && isWordChar(text[pos]!)) {
			pos++
		}
	} else if (!/\s/.test(text[pos]!)) {
		while (
			pos < text.length &&
			!isWordChar(text[pos]!) &&
			!/\s/.test(text[pos]!)
		) {
			pos++
		}
	}

	while (pos < text.length && /\s/.test(text[pos]!)) {
		pos++
	}

	return pos
}

export const moveByWord = (
	position: CursorPosition,
	direction: 'left' | 'right',
	text: string,
	lineEntries: LineEntry[]
): CursorPosition => {
	const newOffset =
		direction === 'left'
			? findWordBoundaryLeft(text, position.offset)
			: findWordBoundaryRight(text, position.offset)

	return offsetToPosition(newOffset, lineEntries)
}
