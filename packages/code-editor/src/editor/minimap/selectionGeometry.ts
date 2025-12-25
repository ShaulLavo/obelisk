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

	if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
		return []
	}

	if (!Number.isFinite(charWidth) || charWidth <= 0) {
		return []
	}

	if (!Number.isFinite(maxChars) || maxChars <= 0) {
		return []
	}

	if (!Number.isFinite(clipWidth) || clipWidth <= 0) {
		return []
	}

	if (!Number.isFinite(deviceHeight) || deviceHeight < 0) {
		return []
	}

	if (!Number.isFinite(scrollOffset) || scrollOffset < 0) {
		return []
	}

	if (startLine > endLine) {
		return []
	}

	if (startLine === endLine && startColumn > endColumn) {
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
