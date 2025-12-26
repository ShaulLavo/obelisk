/**
 * Byte-level pattern search
 *
 * Core algorithm for finding literal patterns in raw byte chunks.
 * Uses simple first-byte check + verify approach.
 *
 * TODO: Future optimizations:
 * - Implement Boyer-Moore-Horspool algorithm (skip table) for longer patterns
 * - Add case-insensitive search support (requires ASCII folding or full Unicode table)
 * - Improve binary file detection (beyond simple null-byte check)
 * - SIMD optimizations via WebAssembly for very large files
 */

/**
 * Find all occurrences of a byte pattern in a chunk.
 *
 * @param chunk - Raw bytes to search
 * @param pattern - Pattern bytes to find
 * @param startOffset - Byte offset to start searching from (default: 0)
 * @returns Array of byte offsets where matches start
 *
 * @example
 * const chunk = new TextEncoder().encode('hello world hello')
 * const pattern = new TextEncoder().encode('hello')
 * findPatternInChunk(chunk, pattern) // [0, 12]
 */
export function findPatternInChunk(
	chunk: Uint8Array,
	pattern: Uint8Array,
	startOffset: number = 0
): number[] {
	const matches: number[] = []

	// Edge cases
	if (pattern.length === 0) return matches
	if (chunk.length < pattern.length) return matches
	if (startOffset >= chunk.length) return matches

	const firstByte = pattern[0]!
	const patternLen = pattern.length
	const searchEnd = chunk.length - patternLen + 1

	// Single-byte pattern fast path
	if (patternLen === 1) {
		for (let i = startOffset; i < chunk.length; i++) {
			if (chunk[i] === firstByte) {
				matches.push(i)
			}
		}
		return matches
	}

	// Multi-byte pattern: first-byte check + verify
	for (let i = startOffset; i < searchEnd; i++) {
		// Fast path: check first byte
		if (chunk[i] !== firstByte) continue

		// Verify remaining bytes
		let match = true
		for (let j = 1; j < patternLen; j++) {
			if (chunk[i + j] !== pattern[j]) {
				match = false
				break
			}
		}

		if (match) {
			matches.push(i)
		}
	}

	return matches
}

/**
 * Check if pattern exists in chunk (early exit on first match).
 * Faster than findPatternInChunk when you only need existence check.
 */
export function hasPattern(
	chunk: Uint8Array,
	pattern: Uint8Array,
	startOffset: number = 0
): boolean {
	if (pattern.length === 0) return false
	if (chunk.length < pattern.length) return false
	if (startOffset >= chunk.length) return false

	const firstByte = pattern[0]!
	const patternLen = pattern.length
	const searchEnd = chunk.length - patternLen + 1

	for (let i = startOffset; i < searchEnd; i++) {
		if (chunk[i] !== firstByte) continue

		let match = true
		for (let j = 1; j < patternLen; j++) {
			if (chunk[i + j] !== pattern[j]) {
				match = false
				break
			}
		}

		if (match) return true
	}

	return false
}

/**
 * Count occurrences of a byte in a range.
 * Used for counting newlines to track line numbers.
 */
export function countByte(
	chunk: Uint8Array,
	byte: number,
	start: number = 0,
	end?: number
): number {
	const endIdx = end ?? chunk.length
	let count = 0
	for (let i = start; i < endIdx; i++) {
		if (chunk[i] === byte) count++
	}
	return count
}

/**
 * Find the index of a byte, searching backward from a position.
 * Returns -1 if not found.
 */
export function findByteBackward(
	chunk: Uint8Array,
	byte: number,
	fromIndex: number
): number {
	for (let i = Math.min(fromIndex, chunk.length - 1); i >= 0; i--) {
		if (chunk[i] === byte) return i
	}
	return -1
}

/**
 * Find the index of a byte, searching forward from a position.
 * Returns chunk.length if not found (end of chunk).
 */
export function findByteForward(
	chunk: Uint8Array,
	byte: number,
	fromIndex: number
): number {
	for (let i = Math.max(fromIndex, 0); i < chunk.length; i++) {
		if (chunk[i] === byte) return i
	}
	return chunk.length
}
