import {
	CHAR_WIDTH_RATIO,
	COLUMN_CHARS_PER_ITEM,
	LINE_HEIGHT_RATIO,
	MIN_ESTIMATED_LINE_HEIGHT,
	TAB_SIZE
} from './consts'
import type { LineEntry } from './types'

export const estimateLineHeight = (fontSize: number) =>
	Math.max(Math.round(fontSize * LINE_HEIGHT_RATIO), MIN_ESTIMATED_LINE_HEIGHT)

export const estimateColumnWidth = (fontSize: number) =>
	Math.max(fontSize * CHAR_WIDTH_RATIO * COLUMN_CHARS_PER_ITEM, fontSize * 4)

let measureCanvas: HTMLCanvasElement | null = null

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

	if (!measureCanvas) {
		measureCanvas = document.createElement('canvas')
	}

	const ctx = measureCanvas.getContext('2d')
	if (!ctx) {
		return fontSize * CHAR_WIDTH_RATIO
	}

	ctx.font = `${fontSize}px ${fontFamily}`

	const metrics = ctx.measureText('M')
	const width = metrics.width

	charWidthCache.set(cacheKey, width)

	return width
}

export const clearCharWidthCache = () => {
	charWidthCache.clear()
}

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

const normalizeTabSize = (tabSize: number): number => {
	return Number.isFinite(tabSize) && tabSize > 0 ? tabSize : TAB_SIZE
}

const getTabAdvance = (visualColumn: number, tabSize: number): number => {
	const normalizedTab = normalizeTabSize(tabSize)
	const remainder = visualColumn % normalizedTab
	return remainder === 0 ? normalizedTab : normalizedTab - remainder
}

export const calculateVisualColumnCount = (
	text: string,
	tabSize = TAB_SIZE
): number => {
	let visualColumn = 0
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\t') {
			visualColumn += getTabAdvance(visualColumn, tabSize)
		} else {
			visualColumn += 1
		}
	}
	return visualColumn
}

const normalizeCharWidth = (charWidth: number): number => {
	return Number.isFinite(charWidth) && charWidth > 0 ? charWidth : 1
}

export const calculateColumnOffset = (
	text: string,
	column: number,
	charWidth: number,
	tabSize = TAB_SIZE
): number => {
	const safeCharWidth = normalizeCharWidth(charWidth)
	const clampedColumn = Math.max(0, Math.min(column, text.length))
	let visualColumn = 0

	for (let i = 0; i < clampedColumn; i++) {
		if (text[i] === '\t') {
			visualColumn += getTabAdvance(visualColumn, tabSize)
		} else {
			visualColumn += 1
		}
	}

	return visualColumn * safeCharWidth
}

export const calculateColumnFromX = (
	text: string,
	targetX: number,
	charWidth: number,
	tabSize = TAB_SIZE
): number => {
	const safeCharWidth = normalizeCharWidth(charWidth)
	const safeTarget = Math.max(0, targetX) / safeCharWidth

	let visualColumn = 0

	for (let i = 0; i < text.length; i++) {
		const advance =
			text[i] === '\t' ? getTabAdvance(visualColumn, tabSize) : 1
		const midpoint = visualColumn + advance / 2

		if (safeTarget < midpoint) {
			return i
		}

		visualColumn += advance
	}

	return text.length
}

export const calculateColumnFromClick = (
	text: string,
	clickX: number,
	charWidth: number,
	tabSize = TAB_SIZE
): number => {
	return calculateColumnFromX(text, clickX, charWidth, tabSize)
}
