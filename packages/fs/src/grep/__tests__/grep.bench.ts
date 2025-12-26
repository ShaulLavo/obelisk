/**
 * Grep Micro-Benchmarks
 *
 * Run with: npx vitest bench grep.bench.ts
 */

import { describe, bench } from 'vitest'
import { findPatternInChunk, hasPattern, countByte } from '../byteSearch'
import { extractLine } from '../lineExtractor'

const textEncoder = new TextEncoder()

// Generate test data
function generateTextChunk(
	sizeKB: number,
	lineLength: number = 80
): Uint8Array {
	const lines: string[] = []
	const targetBytes = sizeKB * 1024
	let currentBytes = 0

	while (currentBytes < targetBytes) {
		const line = 'x'.repeat(lineLength) + '\n'
		lines.push(line)
		currentBytes += line.length
	}

	return textEncoder.encode(lines.join(''))
}

function generateChunkWithPattern(
	sizeKB: number,
	pattern: string,
	occurrences: number
): Uint8Array {
	const chunk = generateTextChunk(sizeKB)
	const patternBytes = textEncoder.encode(pattern)

	// Insert pattern at regular intervals
	const interval = Math.floor(chunk.length / (occurrences + 1))
	for (let i = 0; i < occurrences; i++) {
		const offset = interval * (i + 1)
		chunk.set(patternBytes, offset)
	}

	return chunk
}

// ============================================================================
// Byte Search Benchmarks
// ============================================================================

describe('findPatternInChunk', () => {
	const chunk64KB = generateTextChunk(64)
	const chunk512KB = generateTextChunk(512)
	const chunk1MB = generateTextChunk(1024)

	const shortPattern = textEncoder.encode('TODO')
	const longPattern = textEncoder.encode('console.log("debug")')

	bench('64KB chunk, short pattern, no match', () => {
		findPatternInChunk(chunk64KB, shortPattern)
	})

	bench('512KB chunk, short pattern, no match', () => {
		findPatternInChunk(chunk512KB, shortPattern)
	})

	bench('1MB chunk, short pattern, no match', () => {
		findPatternInChunk(chunk1MB, shortPattern)
	})

	bench('512KB chunk, long pattern, no match', () => {
		findPatternInChunk(chunk512KB, longPattern)
	})

	// With matches
	const chunkWithMatches = generateChunkWithPattern(512, 'TODO', 50)

	bench('512KB chunk, 50 matches', () => {
		findPatternInChunk(chunkWithMatches, shortPattern)
	})
})

describe('hasPattern (early exit)', () => {
	const chunk512KB = generateTextChunk(512)
	const pattern = textEncoder.encode('TODO')

	// Pattern at start
	const chunkWithEarlyMatch = new Uint8Array(chunk512KB)
	chunkWithEarlyMatch.set(textEncoder.encode('TODO'), 100)

	// Pattern at end
	const chunkWithLateMatch = new Uint8Array(chunk512KB)
	chunkWithLateMatch.set(textEncoder.encode('TODO'), chunk512KB.length - 100)

	bench('512KB, no match (full scan)', () => {
		hasPattern(chunk512KB, pattern)
	})

	bench('512KB, early match (byte 100)', () => {
		hasPattern(chunkWithEarlyMatch, pattern)
	})

	bench('512KB, late match (near end)', () => {
		hasPattern(chunkWithLateMatch, pattern)
	})
})

describe('countByte (newlines)', () => {
	const chunk64KB = generateTextChunk(64, 80) // ~800 lines
	const chunk512KB = generateTextChunk(512, 80) // ~6400 lines

	bench('64KB, count newlines', () => {
		countByte(chunk64KB, 0x0a)
	})

	bench('512KB, count newlines', () => {
		countByte(chunk512KB, 0x0a)
	})
})

// ============================================================================
// Line Extraction Benchmarks
// ============================================================================

describe('extractLine', () => {
	const chunk = textEncoder.encode(
		Array.from({ length: 1000 }, (_, i) => `Line ${i}: ${'x'.repeat(70)}`).join(
			'\n'
		)
	)

	bench('extract line from start', () => {
		extractLine(chunk, 10, 0)
	})

	bench('extract line from middle', () => {
		extractLine(chunk, chunk.length / 2, 0)
	})

	bench('extract line from end', () => {
		extractLine(chunk, chunk.length - 100, 0)
	})
})

// ============================================================================
// Throughput Calculation
// ============================================================================

describe('throughput metrics', () => {
	const sizes = [64, 256, 512, 1024] // KB

	for (const sizeKB of sizes) {
		const chunk = generateTextChunk(sizeKB)
		const pattern = textEncoder.encode('NOTFOUND')

		bench(`scan ${sizeKB}KB`, () => {
			findPatternInChunk(chunk, pattern)
		})
	}
})
