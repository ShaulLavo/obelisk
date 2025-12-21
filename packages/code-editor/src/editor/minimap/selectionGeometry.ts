import { loggers } from '@repo/logger'

export type MinimapSelectionRect = {
	line: number
	x: number
	y: number
	width: number
	height: number
}

export type MinimapSelectionLayout = {
	startLine: number
	startColumn: number
	endLine: number
	endColumn: number
}

export type MinimapSelectionMetrics = {
	rowHeight: number
	charWidth: number
	scrollOffset: number
	deviceHeight: number
	maxChars: number
	xOffset: number
	clipWidth: number
}

type LineLengthProvider = (line: number) => number

const log = loggers.codeEditor.withTag('minimap-selection')

const assert = (
	condition: boolean,
	message: string,
	details?: Record<string, unknown>
) => {
	if (condition) return true
	log.warn(message, details)
	return false
}

const clampColumn = (column: number, maxColumn: number): number => {
	if (!Number.isFinite(column)) return 0
	return Math.max(0, Math.min(column, maxColumn))
}

const normalizeLineLength = (length: number): number => {
	if (!Number.isFinite(length)) return 0
	return Math.max(0, length)
}

export const computeMinimapSelectionRects = (
	selection: MinimapSelectionLayout,
	getLineTextLength: LineLengthProvider,
	metrics: MinimapSelectionMetrics
): MinimapSelectionRect[] => {
	const { startLine, endLine, startColumn, endColumn } = selection
	const {
		rowHeight,
		charWidth,
		scrollOffset,
		deviceHeight,
		maxChars,
		xOffset,
		clipWidth,
	} = metrics

	if (
		!assert(
			Number.isFinite(rowHeight) && rowHeight > 0,
			'Minimap selection row height must be positive',
			{ rowHeight }
		)
	) {
		return []
	}

	if (
		!assert(
			Number.isFinite(charWidth) && charWidth > 0,
			'Minimap selection char width must be positive',
			{ charWidth }
		)
	) {
		return []
	}

	if (
		!assert(
			Number.isFinite(maxChars) && maxChars > 0,
			'Minimap selection max chars must be positive',
			{ maxChars }
		)
	) {
		return []
	}

	if (
		!assert(
			Number.isFinite(clipWidth) && clipWidth > 0,
			'Minimap selection clip width must be positive',
			{ clipWidth }
		)
	) {
		return []
	}

	if (
		!assert(
			Number.isFinite(deviceHeight) && deviceHeight >= 0,
			'Minimap selection device height must be valid',
			{ deviceHeight }
		)
	) {
		return []
	}

	if (!Number.isFinite(scrollOffset) || scrollOffset < 0) {
		assert(false, 'Minimap selection scroll offset must be non-negative', {
			scrollOffset,
		})
		return []
	}

	if (startLine > endLine) {
		assert(false, 'Minimap selection lines are out of order', {
			startLine,
			endLine,
		})
		return []
	}

	if (startLine === endLine && startColumn > endColumn) {
		assert(false, 'Minimap selection columns are out of order', {
			startLine,
			startColumn,
			endColumn,
		})
		return []
	}

	const visibleStart = Math.max(0, Math.floor(scrollOffset / rowHeight))
	const visibleEnd = Math.max(
		visibleStart,
		Math.ceil((scrollOffset + deviceHeight) / rowHeight)
	)
	const firstLine = Math.max(startLine, visibleStart)
	const lastLine = Math.min(endLine, visibleEnd - 1)

	if (firstLine > lastLine) return []

	const rects: MinimapSelectionRect[] = []
	const lineHeight = Math.max(1, rowHeight)

	for (let line = firstLine; line <= lastLine; line++) {
		const rawLength = normalizeLineLength(getLineTextLength(line))
		const maxColumn = Math.min(maxChars, rawLength)

		let lineStart = 0
		let lineEnd = rawLength

		if (startLine === endLine) {
			lineStart = startColumn
			lineEnd = endColumn
		} else if (line === startLine) {
			lineStart = startColumn
		} else if (line === endLine) {
			lineEnd = endColumn
		}

		const clampedStart = clampColumn(lineStart, maxColumn)
		const clampedEnd = clampColumn(lineEnd, maxColumn)

		if (clampedEnd <= clampedStart) continue

		const rawStartX = clampedStart * charWidth
		const rawEndX = clampedEnd * charWidth
		const xStart = xOffset + rawStartX
		const xEnd = Math.min(xOffset + clipWidth, xOffset + rawEndX)

		if (xEnd <= xStart) continue

		rects.push({
			line,
			x: xStart,
			y: line * rowHeight - scrollOffset,
			width: xEnd - xStart,
			height: lineHeight,
		})
	}

	return rects
}
