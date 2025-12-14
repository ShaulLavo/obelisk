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
	getTextRange: (start: number, end: number) => string,
	documentLength: number,
	lineStarts: number[]
): CursorPosition => {
	const maxLength = Math.max(0, documentLength)

	const chunkSize = 4096
	let newOffset = Math.min(Math.max(0, position.offset), maxLength)

	if (direction === 'left') {
		let end = newOffset
		while (end > 0) {
			const start = Math.max(0, end - chunkSize)
			const chunk = getTextRange(start, end)
			const boundary = findWordBoundaryLeft(chunk, end - start)
			newOffset = start + boundary

			if (boundary > 0 || start === 0 || chunk.trim().length > 0) {
				break
			}

			end = start
		}
	} else {
		let start = newOffset
		while (start < maxLength) {
			const end = Math.min(maxLength, start + chunkSize)
			const chunk = getTextRange(start, end)
			const boundary = findWordBoundaryRight(chunk, 0)
			newOffset = start + boundary

			if (boundary < chunk.length || end === maxLength) {
				break
			}

			start = end
		}
	}

	return offsetToPosition(newOffset, lineStarts, maxLength)
}
