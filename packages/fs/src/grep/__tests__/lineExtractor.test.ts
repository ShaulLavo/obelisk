/**
 * Line Extractor Tests
 */

import { describe, it, expect } from 'vitest'
import { extractLine, isBinaryChunk, trimLine } from '../lineExtractor'

const encode = (s: string) => new TextEncoder().encode(s)

describe('extractLine', () => {
	it('extracts line from single-line chunk', () => {
		const chunk = encode('hello world')
		const result = extractLine(chunk, 6, 0) // match at 'world'

		expect(result.lineNumber).toBe(1)
		expect(result.lineContent).toBe('hello world')
		expect(result.columnOffset).toBe(6)
	})

	it('extracts line from multi-line chunk', () => {
		const chunk = encode('line1\nline2\nline3')
		// Match 'l' in 'line2' - offset 6
		const result = extractLine(chunk, 6, 0)

		expect(result.lineNumber).toBe(2)
		expect(result.lineContent).toBe('line2')
		expect(result.columnOffset).toBe(0)
	})

	it('handles match on first line', () => {
		const chunk = encode('first\nsecond\nthird')
		const result = extractLine(chunk, 0, 0)

		expect(result.lineNumber).toBe(1)
		expect(result.lineContent).toBe('first')
		expect(result.columnOffset).toBe(0)
	})

	it('handles match on last line', () => {
		const chunk = encode('first\nsecond\nthird')
		const result = extractLine(chunk, 13, 0) // 'third' starts at 13

		expect(result.lineNumber).toBe(3)
		expect(result.lineContent).toBe('third')
		expect(result.columnOffset).toBe(0)
	})

	it('respects linesBeforeChunk offset', () => {
		const chunk = encode('chunk line')
		const result = extractLine(chunk, 0, 99)

		expect(result.lineNumber).toBe(100) // 99 + 1
	})

	it('handles line with leading whitespace', () => {
		const chunk = encode('  indented line')
		const result = extractLine(chunk, 2, 0) // match at 'i'

		expect(result.lineContent).toBe('  indented line')
		expect(result.columnOffset).toBe(2)
	})

	it('handles empty lines', () => {
		const chunk = encode('before\n\nafter')
		// Match at start of 'after' (offset 8)
		const result = extractLine(chunk, 8, 0)

		expect(result.lineNumber).toBe(3)
		expect(result.lineContent).toBe('after')
	})

	it('handles match in middle of line', () => {
		const chunk = encode('prefix_match_suffix')
		const result = extractLine(chunk, 7, 0) // 'match' starts at 7

		expect(result.lineContent).toBe('prefix_match_suffix')
		expect(result.columnOffset).toBe(7)
	})
})

describe('isBinaryChunk', () => {
	it('detects null bytes as binary', () => {
		const chunk = new Uint8Array([0x48, 0x65, 0x00, 0x6c, 0x6c, 0x6f])
		expect(isBinaryChunk(chunk)).toBe(true)
	})

	it('returns false for plain text', () => {
		const chunk = encode('hello world\nthis is text')
		expect(isBinaryChunk(chunk)).toBe(false)
	})

	it('returns false for empty chunk', () => {
		const chunk = new Uint8Array(0)
		expect(isBinaryChunk(chunk)).toBe(false)
	})

	it('respects sample size', () => {
		// Null byte after sample size should not be detected
		const chunk = new Uint8Array(100)
		chunk.fill(0x41) // 'A'
		chunk[50] = 0x00 // Null in middle

		expect(isBinaryChunk(chunk, 40)).toBe(false) // Sample misses null
		expect(isBinaryChunk(chunk, 60)).toBe(true) // Sample finds null
	})
})

describe('trimLine', () => {
	it('trims leading whitespace', () => {
		expect(trimLine('  hello')).toBe('hello')
	})

	it('trims trailing whitespace', () => {
		expect(trimLine('hello  ')).toBe('hello')
	})

	it('trims tabs', () => {
		expect(trimLine('\thello\t')).toBe('hello')
	})

	it('trims mixed whitespace', () => {
		expect(trimLine('  \t hello \t  ')).toBe('hello')
	})

	it('handles empty string', () => {
		expect(trimLine('')).toBe('')
	})
})
