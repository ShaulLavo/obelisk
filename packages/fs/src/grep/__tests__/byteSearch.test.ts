/**
 * Byte Search Tests
 */

import { describe, it, expect } from 'vitest'
import {
	findPatternInChunk,
	hasPattern,
	countByte,
	findByteBackward,
	findByteForward,
} from '../byteSearch'

const encode = (s: string) => new TextEncoder().encode(s)

describe('findPatternInChunk', () => {
	it('finds single occurrence', () => {
		const chunk = encode('hello world')
		const pattern = encode('world')
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([6])
	})

	it('finds multiple occurrences', () => {
		const chunk = encode('hello hello hello')
		const pattern = encode('hello')
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([0, 6, 12])
	})

	it('finds overlapping occurrences', () => {
		const chunk = encode('aaa')
		const pattern = encode('aa')
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([0, 1])
	})

	it('returns empty array when no match', () => {
		const chunk = encode('hello world')
		const pattern = encode('xyz')
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([])
	})

	it('handles pattern at start', () => {
		const chunk = encode('hello world')
		const pattern = encode('hello')
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([0])
	})

	it('handles pattern at end', () => {
		const chunk = encode('hello world')
		const pattern = encode('world')
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([6])
	})

	it('handles single-byte pattern', () => {
		const chunk = encode('aXbXcX')
		const pattern = encode('X')
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([1, 3, 5])
	})

	it('handles empty pattern', () => {
		const chunk = encode('hello')
		const pattern = encode('')
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([])
	})

	it('handles pattern longer than chunk', () => {
		const chunk = encode('hi')
		const pattern = encode('hello')
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([])
	})

	it('respects startOffset', () => {
		const chunk = encode('hello hello')
		const pattern = encode('hello')
		const matches = findPatternInChunk(chunk, pattern, 5)
		expect(matches).toEqual([6])
	})

	it('handles binary data', () => {
		const chunk = new Uint8Array([0x00, 0x01, 0x02, 0x01, 0x02, 0x03])
		const pattern = new Uint8Array([0x01, 0x02])
		const matches = findPatternInChunk(chunk, pattern)
		expect(matches).toEqual([1, 3])
	})
})

describe('hasPattern', () => {
	it('returns true when pattern exists', () => {
		const chunk = encode('hello world')
		const pattern = encode('world')
		expect(hasPattern(chunk, pattern)).toBe(true)
	})

	it('returns false when pattern does not exist', () => {
		const chunk = encode('hello world')
		const pattern = encode('xyz')
		expect(hasPattern(chunk, pattern)).toBe(false)
	})

	it('returns false for empty pattern', () => {
		const chunk = encode('hello')
		const pattern = encode('')
		expect(hasPattern(chunk, pattern)).toBe(false)
	})

	it('returns false when chunk is too small', () => {
		const chunk = encode('hi')
		const pattern = encode('hello')
		expect(hasPattern(chunk, pattern)).toBe(false)
	})
})

describe('countByte', () => {
	it('counts newlines', () => {
		const chunk = encode('line1\nline2\nline3\n')
		expect(countByte(chunk, 0x0a)).toBe(3)
	})

	it('counts within range', () => {
		const chunk = encode('a\nb\nc\nd\n')
		// Count newlines from index 0 to 4 (exclusive)
		expect(countByte(chunk, 0x0a, 0, 4)).toBe(2)
	})

	it('returns 0 for no matches', () => {
		const chunk = encode('no newlines')
		expect(countByte(chunk, 0x0a)).toBe(0)
	})
})

describe('findByteBackward', () => {
	it('finds byte scanning backward', () => {
		const chunk = encode('hello\nworld')
		expect(findByteBackward(chunk, 0x0a, 10)).toBe(5)
	})

	it('returns -1 when not found', () => {
		const chunk = encode('hello world')
		expect(findByteBackward(chunk, 0x0a, 10)).toBe(-1)
	})

	it('finds byte at exact position', () => {
		const chunk = encode('hello\nworld')
		expect(findByteBackward(chunk, 0x0a, 5)).toBe(5)
	})
})

describe('findByteForward', () => {
	it('finds byte scanning forward', () => {
		const chunk = encode('hello\nworld')
		expect(findByteForward(chunk, 0x0a, 0)).toBe(5)
	})

	it('returns chunk.length when not found', () => {
		const chunk = encode('hello world')
		expect(findByteForward(chunk, 0x0a, 0)).toBe(11)
	})

	it('finds byte at exact position', () => {
		const chunk = encode('hello\nworld')
		expect(findByteForward(chunk, 0x0a, 5)).toBe(5)
	})
})
