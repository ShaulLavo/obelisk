/**
 * Line Extractor
 *
 * Extracts line content from raw bytes given a match offset.
 * Decodes only the matched line, not the entire file.
 */

import { countByte, findByteBackward, findByteForward } from './byteSearch'
import type { LineInfo } from './types'

const NEWLINE = 0x0a // \n

// Shared decoder instance (reusable, handles invalid UTF-8 gracefully)
const decoder = new TextDecoder('utf-8', { fatal: false })

/**
 * Extract line information from a match offset within a chunk.
 *
 * @param chunk - Raw bytes containing the match
 * @param matchOffset - Byte offset of match start within chunk
 * @param linesBeforeChunk - Number of complete lines before this chunk
 * @returns Line info including line number, content, and column offset
 */
export function extractLine(
	chunk: Uint8Array,
	matchOffset: number,
	linesBeforeChunk: number = 0
): LineInfo {
	// Find line start (scan backward for \n, or start of chunk)
	const prevNewline = findByteBackward(chunk, NEWLINE, matchOffset - 1)
	const lineStart = prevNewline === -1 ? 0 : prevNewline + 1

	// Find line end (scan forward for \n, or end of chunk)
	const lineEnd = findByteForward(chunk, NEWLINE, matchOffset)

	// Count newlines from start of chunk to match position
	const newlinesBeforeMatch = countByte(chunk, NEWLINE, 0, matchOffset)
	const lineNumber = linesBeforeChunk + newlinesBeforeMatch + 1 // 1-indexed

	// Decode only the line slice
	const lineBytes = chunk.slice(lineStart, lineEnd)
	const lineContent = decoder.decode(lineBytes)

	// Column offset is relative to line start
	const columnOffset = matchOffset - lineStart

	return {
		lineNumber,
		lineContent,
		columnOffset,
	}
}

/**
 * Extract multiple lines for context (e.g., -A, -B, -C flags in grep).
 * FUTURE: Implement when context lines are needed.
 */
// export function extractLinesWithContext(...)

/**
 * Check if a chunk likely contains binary content.
 * Uses simple heuristic: presence of null bytes in first N bytes.
 *
 * @param chunk - Raw bytes to check
 * @param sampleSize - Number of bytes to sample (default: 8192)
 * @returns true if chunk appears to be binary
 */
export function isBinaryChunk(
	chunk: Uint8Array,
	sampleSize: number = 8192
): boolean {
	const checkLength = Math.min(chunk.length, sampleSize)

	for (let i = 0; i < checkLength; i++) {
		// Null byte is a strong indicator of binary content
		if (chunk[i] === 0x00) return true
	}

	return false
}

/**
 * Trim whitespace from decoded line content.
 * Handles common whitespace: space, tab, CR, LF.
 */
export function trimLine(line: string): string {
	// Use native trim which handles all Unicode whitespace
	return line.trim()
}
