import {
	getPieceTableLength,
	getPieceTableText,
	type PieceTableSnapshot,
} from '@repo/utils'
import { countLineBreaks } from './lineTextCache'
import { offsetToLineIndex } from './position'

export type LineData = { text: string; length: number }
export type LineDataMap = Record<number, LineData>

export const clampLineIndex = (value: number, maxIndex: number) =>
	Math.max(0, Math.min(value, maxIndex))

export const buildLineDataFromText = (
	content: string,
	ids: number[],
	starts: number[]
): LineDataMap => {
	const data: LineDataMap = {}
	const lineCount = Math.min(ids.length, starts.length)
	for (let i = 0; i < lineCount; i += 1) {
		const lineId = ids[i]
		const start = starts[i] ?? 0
		const end = starts[i + 1] ?? content.length
		const textEnd = i < lineCount - 1 ? Math.max(start, end - 1) : end
		const text = content.slice(start, textEnd)
		const length = Math.max(0, end - start)
		if (typeof lineId === 'number') {
			data[lineId] = { text, length }
		}
	}
	return data
}

export const buildLineDataFromSnapshot = (
	snapshot: PieceTableSnapshot,
	ids: number[],
	starts: number[]
): LineDataMap => {
	const data: LineDataMap = {}
	const lineCount = Math.min(ids.length, starts.length)
	const docLength = getPieceTableLength(snapshot)
	for (let i = 0; i < lineCount; i += 1) {
		const lineId = ids[i]
		const start = starts[i] ?? 0
		const end = starts[i + 1] ?? docLength
		const textEnd = i < lineCount - 1 ? Math.max(start, end - 1) : end
		const text = getPieceTableText(snapshot, start, textEnd)
		const length = Math.max(0, end - start)
		if (typeof lineId === 'number') {
			data[lineId] = { text, length }
		}
	}
	return data
}

export const buildEditedLineTexts = (options: {
	startLineText: string
	endLineText: string
	startColumn: number
	endColumn: number
	insertedText: string
}): string[] => {
	const startText = options.startLineText
	const endText = options.endLineText
	const startColumn = Math.max(
		0,
		Math.min(options.startColumn, startText.length)
	)
	const endColumn = Math.max(0, Math.min(options.endColumn, endText.length))
	const prefix = startText.slice(0, startColumn)
	const suffix = endText.slice(endColumn)
	const insertedLines = options.insertedText.split('\n')

	if (insertedLines.length === 1) {
		return [prefix + options.insertedText + suffix]
	}

	const nextLines: string[] = new Array(insertedLines.length)
	nextLines[0] = `${prefix}${insertedLines[0] ?? ''}`
	for (let i = 1; i < insertedLines.length - 1; i += 1) {
		nextLines[i] = insertedLines[i] ?? ''
	}
	nextLines[insertedLines.length - 1] = `${
		insertedLines[insertedLines.length - 1] ?? ''
	}${suffix}`
	return nextLines
}

export const buildLineIdsForEdit = (
	options: {
		prevLineIds: number[]
		startLine: number
		endLine: number
		lineDelta: number
		expectedLineCount: number
	},
	generateIds: (count: number) => number[]
): number[] => {
	const expectedCount = options.expectedLineCount
	if (expectedCount <= 0) return []
	if (options.prevLineIds.length === 0) return generateIds(expectedCount)

	const maxIndex = options.prevLineIds.length - 1
	if (maxIndex < 0) return generateIds(expectedCount)

	const safeStart = clampLineIndex(options.startLine, maxIndex)
	const safeEnd = Math.max(safeStart, clampLineIndex(options.endLine, maxIndex))
	const replacedCount = safeEnd - safeStart + 1
	const nextSegmentCount = Math.max(0, replacedCount + options.lineDelta)
	const before = options.prevLineIds.slice(0, safeStart)
	const after = options.prevLineIds.slice(safeEnd + 1)

	if (nextSegmentCount === 0) return [...before, ...after]

	const preservedId = options.prevLineIds[safeStart] ?? generateIds(1)[0]!
	const extraCount = Math.max(0, nextSegmentCount - 1)
	const addedIds = extraCount > 0 ? generateIds(extraCount) : []
	const nextIds = [...before, preservedId, ...addedIds, ...after]
	return nextIds.length === expectedCount ? nextIds : generateIds(expectedCount)
}

export type EditMetadata = {
	prevLineStarts: number[]
	prevLineIds: number[]
	prevDocumentLength: number
	prevLineCount: number
	lineDelta: number
	endOffset: number
	startLine: number
	endLine: number
	expectedLineCount: number
	shouldResetLineIds: boolean
	shouldUpdateLineIds: boolean
}

export const computeEditMetadata = (
	startIndex: number,
	deletedText: string,
	insertedText: string,
	state: {
		lineStarts: number[]
		lineIds: number[]
		documentLength: number
	}
): EditMetadata => {
	const prevLineStarts = state.lineStarts
	const prevLineIds = state.lineIds
	const prevDocumentLength = state.documentLength
	const prevLineCount = prevLineStarts.length
	const deletedLineBreaks = countLineBreaks(deletedText)
	const insertedLineBreaks = countLineBreaks(insertedText)
	const lineDelta = insertedLineBreaks - deletedLineBreaks
	const endOffset = Math.min(
		prevDocumentLength,
		startIndex + deletedText.length
	)
	const startLine = offsetToLineIndex(
		startIndex,
		prevLineStarts,
		prevDocumentLength
	)
	const endLine = offsetToLineIndex(
		endOffset,
		prevLineStarts,
		prevDocumentLength
	)
	const expectedLineCount = Math.max(0, prevLineCount + lineDelta)
	const shouldResetLineIds =
		prevLineIds.length !== prevLineCount || prevLineIds.length === 0
	const shouldUpdateLineIds = lineDelta !== 0 || shouldResetLineIds

	return {
		prevLineStarts,
		prevLineIds,
		prevDocumentLength,
		prevLineCount,
		lineDelta,
		endOffset,
		startLine,
		endLine,
		expectedLineCount,
		shouldResetLineIds,
		shouldUpdateLineIds,
	}
}

export const createLineIdGenerator = (startId: number = 1) => {
	let nextId = startId
	return (count: number): number[] => {
		const ids = new Array(Math.max(0, count))
		for (let i = 0; i < ids.length; i += 1) {
			ids[i] = nextId
			nextId += 1
		}
		return ids
	}
}
