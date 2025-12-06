export const calculateCursorX = (
	column: number,
	fontSize: number,
	charWidthRatio: number
): number => {
	return column * fontSize * charWidthRatio
}

export const calculateColumnFromX = (
	x: number,
	fontSize: number,
	charWidthRatio: number,
	maxColumn: number
): number => {
	const charWidth = fontSize * charWidthRatio
	const column = Math.round(x / charWidth)
	return Math.max(0, Math.min(column, maxColumn))
}
