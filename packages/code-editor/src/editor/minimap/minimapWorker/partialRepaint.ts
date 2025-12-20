import { Constants } from './constants'

// ============================================================================
// Partial Repainting State
// ============================================================================

let previousTokens: Uint16Array | null = null
let previousMaxChars: number = 0
let previousLineCount: number = 0
let previousVersion: number = -1
let cachedImageData: ImageData | null = null
let cachedScrollY: number = 0
let cachedScale: number = 0

// ============================================================================
// State Accessors
// ============================================================================

export const getCachedImageData = (): ImageData | null => cachedImageData

export const setCachedImageData = (data: ImageData | null): void => {
	cachedImageData = data
}

export const getCachedScrollY = (): number => cachedScrollY

export const setCachedScrollY = (scrollY: number): void => {
	cachedScrollY = scrollY
}

export const getCachedScale = (): number => cachedScale

export const setCachedScale = (scale: number): void => {
	cachedScale = scale
}

export const getPreviousTokens = (): Uint16Array | null => previousTokens

export const getPreviousMaxChars = (): number => previousMaxChars

export const getPreviousLineCount = (): number => previousLineCount

export const getPreviousVersion = (): number => previousVersion

export const setPreviousState = (
	tokens: Uint16Array,
	maxChars: number,
	lineCount: number,
	version: number
): void => {
	previousTokens = tokens
	previousMaxChars = maxChars
	previousLineCount = lineCount
	previousVersion = version
}

export const resetPartialRepaintState = (): void => {
	previousTokens = null
	previousMaxChars = 0
	previousLineCount = 0
	previousVersion = -1
	cachedImageData = null
	cachedScrollY = 0
	cachedScale = 0
}

export const invalidateCache = (): void => {
	cachedImageData = null
	cachedScrollY = 0
	cachedScale = 0
}

// ============================================================================
// Dirty Line Detection
// ============================================================================

export const findDirtyLinesInRange = (
	newTokens: Uint16Array,
	newMaxChars: number,
	newLineCount: number,
	startLine: number,
	endLine: number
): Set<number> => {
	const dirtyLines = new Set<number>()

	const start = Math.max(0, Math.min(newLineCount, startLine))
	const end = Math.max(start, Math.min(newLineCount, endLine))

	if (start === end) return dirtyLines

	if (
		!previousTokens ||
		previousMaxChars !== newMaxChars ||
		previousLineCount !== newLineCount
	) {
		for (let line = start; line < end; line++) dirtyLines.add(line)
		return dirtyLines
	}

	for (let line = start; line < end; line++) {
		const offset = line * newMaxChars
		for (let char = 0; char < newMaxChars; char++) {
			if (newTokens[offset + char] !== previousTokens[offset + char]) {
				dirtyLines.add(line)
				break
			}
		}
	}

	return dirtyLines
}

/**
 * Clear specific lines in the image data
 */
export const clearLines = (
	dest: Uint8ClampedArray,
	dirtyLines: Set<number>,
	charH: number,
	scrollY: number,
	deviceWidth: number,
	deviceHeight: number
): void => {
	const destWidth = deviceWidth * Constants.RGBA_CHANNELS_CNT

	for (const line of dirtyLines) {
		const yStart = Math.floor(line * charH - scrollY)
		const yEnd = yStart + charH

		if (yEnd <= 0 || yStart >= deviceHeight) continue

		const clippedStartY = Math.max(0, yStart)
		const clippedEndY = Math.min(deviceHeight, yEnd)

		const startIdx = clippedStartY * destWidth
		const endIdx = clippedEndY * destWidth

		dest.fill(0, startIdx, endIdx)
	}
}
