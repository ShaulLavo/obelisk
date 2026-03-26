/**
 * Line Extractor
 *
 * Extracts line content from raw bytes given a match offset.
 * Decodes only the matched line, not the entire file.
 */

import { countByte, findByteBackward, findByteForward } from './byteSearch'
import type { LineInfo } from './types'

const NEWLINE = 0x0a

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
	const prevNewline = findByteBackward(chunk, NEWLINE, matchOffset - 1)
	const lineStart = prevNewline === -1 ? 0 : prevNewline + 1

	const lineEnd = findByteForward(chunk, NEWLINE, matchOffset)

	const newlinesBeforeMatch = countByte(chunk, NEWLINE, 0, matchOffset)
	const lineNumber = linesBeforeChunk + newlinesBeforeMatch + 1

	const lineBytes = chunk.slice(lineStart, lineEnd)
	const lineContent = decoder.decode(lineBytes)

	const columnOffset = matchOffset - lineStart

	return {
		lineNumber,
		lineContent,
		columnOffset,
	}
}

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
		if (chunk[i] === 0x00) return true
	}

	return false
}
