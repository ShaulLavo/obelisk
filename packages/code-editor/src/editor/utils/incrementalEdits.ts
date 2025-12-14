import type { DocumentIncrementalEdit, EditorPoint } from '../types'

type OffsetToPoint = (offset: number) => EditorPoint

const advancePointByText = (point: EditorPoint, text: string): EditorPoint => {
	if (text.length === 0) {
		return { row: point.row, column: point.column }
	}

	let row = point.row
	let column = point.column

	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (char === '\n') {
			row += 1
			column = 0
		} else {
			column += 1
		}
	}

	return { row, column }
}

export const describeIncrementalEdit = (
	offsetToPoint: OffsetToPoint,
	startIndex: number,
	deletedText: string,
	insertedText: string
): DocumentIncrementalEdit | null => {
	if (deletedText.length === 0 && insertedText.length === 0) {
		return null
	}

	const startPosition = offsetToPoint(startIndex)
	const oldEndIndex = startIndex + deletedText.length
	const oldEndPosition = offsetToPoint(oldEndIndex)
	const newEndIndex = startIndex + insertedText.length
	const newEndPosition = advancePointByText(startPosition, insertedText)

	return {
		startIndex,
		oldEndIndex,
		newEndIndex,
		startPosition,
		oldEndPosition,
		newEndPosition,
		deletedText,
		insertedText,
	}
}
