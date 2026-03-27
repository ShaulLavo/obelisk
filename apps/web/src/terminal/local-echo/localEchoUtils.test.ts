import { describe, it, expect } from 'vitest'
import {
	getWordBoundaries,
	closestLeftBoundary,
	closestRightBoundary,
	offsetToColRow,
	countLines,
	isIncompleteInput,
	hasTailingWhitespace,
	getLastToken,
	getSharedFragment,
} from './localEchoUtils'

describe('getWordBoundaries', () => {
	it('returns left boundaries (start of words) by default', () => {
		expect(getWordBoundaries('hello world', true)).toEqual([0, 6])
	})

	it('returns right boundaries (end of words)', () => {
		expect(getWordBoundaries('hello world', false)).toEqual([5, 11])
	})

	it('returns empty array for empty string', () => {
		expect(getWordBoundaries('')).toEqual([])
	})

	it('handles multiple spaces between words', () => {
		expect(getWordBoundaries('a   b', true)).toEqual([0, 4])
	})
})

describe('closestLeftBoundary', () => {
	it('finds the closest word start to the left of cursor', () => {
		expect(closestLeftBoundary('hello world', 8)).toBe(6)
	})

	it('returns 0 when cursor is at the beginning', () => {
		expect(closestLeftBoundary('hello world', 0)).toBe(0)
	})

	it('returns 0 when cursor is within the first word', () => {
		expect(closestLeftBoundary('hello world', 3)).toBe(0)
	})

	it('returns previous word start when at space between words', () => {
		expect(closestLeftBoundary('hello world', 6)).toBe(0)
	})
})

describe('closestRightBoundary', () => {
	it('finds the closest word end to the right of cursor', () => {
		expect(closestRightBoundary('hello world', 0)).toBe(5)
	})

	it('returns input length when cursor is at the end', () => {
		expect(closestRightBoundary('hello world', 11)).toBe(11)
	})

	it('finds next word end when cursor is in a space', () => {
		expect(closestRightBoundary('hello world', 5)).toBe(11)
	})
})

describe('offsetToColRow', () => {
	it('returns col=0, row=0 for offset 0', () => {
		expect(offsetToColRow('hello', 0, 80)).toEqual({ col: 0, row: 0 })
	})

	it('advances column for each character', () => {
		expect(offsetToColRow('hello', 3, 80)).toEqual({ col: 3, row: 0 })
	})

	it('wraps to next row when exceeding maxCols', () => {
		expect(offsetToColRow('abcde', 5, 4)).toEqual({ col: 0, row: 1 })
	})

	it('handles newline characters', () => {
		expect(offsetToColRow('ab\ncd', 4, 80)).toEqual({ col: 1, row: 1 })
	})

	it('handles newline at start of a wrap row', () => {
		expect(offsetToColRow('ab\n', 3, 80)).toEqual({ col: 0, row: 1 })
	})
})

describe('countLines', () => {
	it('returns 1 for a single-line string within terminal width', () => {
		expect(countLines('hello', 80)).toBe(1)
	})

	it('returns 2 for a string with one newline', () => {
		expect(countLines('hello\nworld', 80)).toBe(2)
	})

	it('accounts for line wrapping', () => {
		expect(countLines('abcdef', 3)).toBe(2)
	})

	it('returns 1 for empty string', () => {
		expect(countLines('', 80)).toBe(1)
	})
})

describe('isIncompleteInput', () => {
	it('returns false for empty input', () => {
		expect(isIncompleteInput('')).toBe(false)
	})

	it('returns false for complete input', () => {
		expect(isIncompleteInput('ls -la')).toBe(false)
	})

	it('detects unterminated single quotes', () => {
		expect(isIncompleteInput("echo 'hello")).toBe(true)
	})

	it('detects unterminated double quotes', () => {
		expect(isIncompleteInput('echo "hello')).toBe(true)
	})

	it('detects trailing backslash', () => {
		expect(isIncompleteInput('echo hello \\')).toBe(true)
	})

	it('does not treat escaped backslash as continuation', () => {
		expect(isIncompleteInput('echo hello \\\\')).toBe(false)
	})

	it('detects trailing boolean operators', () => {
		expect(isIncompleteInput('ls &&')).toBe(true)
		expect(isIncompleteInput('ls ||')).toBe(true)
	})

	it('detects trailing pipe', () => {
		expect(isIncompleteInput('ls |')).toBe(true)
	})
})

describe('hasTailingWhitespace', () => {
	it('returns true for trailing space', () => {
		expect(hasTailingWhitespace('hello ')).toBe(true)
	})

	it('returns true for trailing tab', () => {
		expect(hasTailingWhitespace('hello\t')).toBe(true)
	})

	it('returns false for no trailing whitespace', () => {
		expect(hasTailingWhitespace('hello')).toBe(false)
	})
})

describe('getLastToken', () => {
	it('returns last token from input', () => {
		expect(getLastToken('ls -la')).toBe('-la')
	})

	it('returns empty string for trailing whitespace', () => {
		expect(getLastToken('ls ')).toBe('')
	})

	it('returns empty string for empty input', () => {
		expect(getLastToken('')).toBe('')
	})
})

describe('getSharedFragment', () => {
	it('returns null for empty candidates', () => {
		expect(getSharedFragment('', [])).toBeNull()
	})

	it('finds common prefix among candidates', () => {
		expect(getSharedFragment('f', ['foo', 'fob', 'fox'])).toBe('fo')
	})

	it('returns full candidate when all candidates are the same', () => {
		expect(getSharedFragment('', ['abc', 'abc'])).toBe('abc')
	})

	it('returns fragment when it already equals shortest candidate', () => {
		expect(getSharedFragment('ab', ['ab', 'abc'])).toBe('ab')
	})
})
