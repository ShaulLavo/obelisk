import {
	CHAR_WIDTH_RATIO,
	COLUMN_CHARS_PER_ITEM,
	LINE_HEIGHT_RATIO,
	MIN_ESTIMATED_LINE_HEIGHT
} from './consts'
import type { LineEntry } from './types'

export const estimateLineHeight = (fontSize: number) =>
	Math.max(Math.round(fontSize * LINE_HEIGHT_RATIO), MIN_ESTIMATED_LINE_HEIGHT)

export const estimateColumnWidth = (fontSize: number) =>
	Math.max(fontSize * CHAR_WIDTH_RATIO * COLUMN_CHARS_PER_ITEM, fontSize * 4)

// Canvas for measuring text - reused for performance
let measureCanvas: HTMLCanvasElement | null = null

/**
 * Measure the actual width of a single character for a given font.
 * Uses canvas measureText for accurate pixel measurement.
 * Results are cached per font configuration.
 */
const charWidthCache = new Map<string, number>()

export const measureCharWidth = (
	fontSize: number,
	fontFamily: string
): number => {
	const cacheKey = `${fontSize}:${fontFamily}`
	const cached = charWidthCache.get(cacheKey)
	if (cached !== undefined) {
		return cached
	}

	// Create canvas lazily
	if (!measureCanvas) {
		measureCanvas = document.createElement('canvas')
	}

	const ctx = measureCanvas.getContext('2d')
	if (!ctx) {
		// Fallback to estimate if canvas not available
		return fontSize * CHAR_WIDTH_RATIO
	}

	ctx.font = `${fontSize}px ${fontFamily}`

	// Measure a representative character (use 'M' for monospace width)
	// For monospace fonts, all characters should have the same width
	const metrics = ctx.measureText('M')
	const width = metrics.width

	// Cache the result
	charWidthCache.set(cacheKey, width)

	return width
}

/**
 * Clear the character width cache (useful when fonts change)
 */
export const clearCharWidthCache = () => {
	charWidthCache.clear()
}

/**
 * Convert text content into line entries for the editor.
 * Each entry contains the line index, start offset, length, and text content.
 */
export const textToLineEntries = (text: string): LineEntry[] => {
	if (text.length === 0) {
		return [
			{
				index: 0,
				start: 0,
				length: 0,
				text: ''
			}
		]
	}

	const entries: LineEntry[] = []
	let lineStart = 0
	let index = 0

	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			const rawLine = text.slice(lineStart, i)
			const length = i - lineStart + 1
			entries.push({
				index,
				start: lineStart,
				length,
				text: rawLine
			})
			index++
			lineStart = i + 1
		}
	}

	if (lineStart <= text.length) {
		const rawLine = text.slice(lineStart)
		entries.push({
			index,
			start: lineStart,
			length: text.length - lineStart,
			text: rawLine
		})
	}

	return entries
}

export const calculateColumnFromClick = (
	clickX: number,
	charWidth: number,
	maxColumn: number
): number => {
	const column = Math.round(clickX / charWidth)
	return Math.max(0, Math.min(column, maxColumn))
}
