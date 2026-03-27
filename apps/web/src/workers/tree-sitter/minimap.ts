import type { MinimapTokenSummary, TreeSitterCapture } from './types'
import { getScopeColorId } from '@repo/code-editor/tokenSummary'
import { astCache } from './cache'

/**
 * Internal: Build minimap tokens from text and optional captures
 */
const buildMinimapTokens = (
	text: string,
	captures: TreeSitterCapture[],
	maxChars: number
): { tokens: Uint16Array; lineCount: number } => {
	const lines = text.split('\n')
	const lineCount = lines.length

	const totalTokens = lineCount * maxChars
	const buffer = new ArrayBuffer(totalTokens * 2)
	const tokens = new Uint16Array(buffer)

	const lineStarts: number[] = new Array(lineCount)
	let offset = 0
	for (let i = 0; i < lineCount; i++) {
		lineStarts[i] = offset
		offset += lines[i]!.length + 1 // +1 for newline
	}

	let captureIndex = 0

	for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
		const lineText = lines[lineIndex]!
		const lineStart = lineStarts[lineIndex]!
		const lineEnd = lineStart + lineText.length

		// Skip past captures that end before this line
		while (
			captureIndex < captures.length &&
			captures[captureIndex]!.endIndex <= lineStart
		) {
			captureIndex++
		}

		const tokenOffset = lineIndex * maxChars
		const sampleLength = Math.min(lineText.length, maxChars)

		for (let i = 0; i < sampleLength; i++) {
			const code = lineText.charCodeAt(i)
			// Color 0, char code in low byte
			tokens[tokenOffset + i] = code
		}

		let idx = captureIndex
		while (idx < captures.length && captures[idx]!.startIndex < lineEnd) {
			const capture = captures[idx]!
			const colorId = getScopeColorId(capture.scope)

			// Calculate intersection with clamped line range [lineStart, lineStart + sampleLength]
			const sampleEndGlobal = lineStart + sampleLength

			const startGlobal = Math.max(capture.startIndex, lineStart)
			const endGlobal = Math.min(capture.endIndex, sampleEndGlobal)

			if (startGlobal < endGlobal) {
				// Map to local token index
				const startLocal = startGlobal - lineStart
				const endLocal = endGlobal - lineStart

				// Fill colors for the character range
				for (let i = startLocal; i < endLocal; i++) {
					const code = lineText.charCodeAt(i)
					// Combine colorId (high byte) + charCode (low byte)
					tokens[tokenOffset + i] = (colorId << 8) | (code & 0xff)
				}
			}

			idx++
		}
	}

	return { tokens, lineCount }
}

/**
 * Generate minimap summary from plain text (no syntax highlighting)
 * Used as fallback for unsupported languages
 */
export const generateMinimapSummaryFromText = (
	text: string,
	version: number,
	maxChars: number = 160
): MinimapTokenSummary => {
	const { tokens, lineCount } = buildMinimapTokens(text, [], maxChars)
	return { tokens, maxChars, lineCount, version }
}

export const generateMinimapSummary = (
	path: string,
	version: number,
	maxChars: number = 160
): MinimapTokenSummary | undefined => {
	const cached = astCache.get(path)
	if (!cached) {
		return undefined
	}

	const { tokens, lineCount } = buildMinimapTokens(
		cached.text,
		cached.captures ?? [],
		maxChars
	)
	return { tokens, maxChars, lineCount, version }
}
