import { loggers } from '@repo/logger'
import {
	getPieceTableLength,
	getPieceTableText,
	type PieceTableSnapshot,
} from '@repo/utils'
import {
	batch,
	createContext,
	createEffect,
	createMemo,
	createSignal,
	untrack,
	useContext,
} from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { useCursorActions } from '../hooks/useCursorActions'
import { useCursorStateManager } from '../hooks/useCursorStateManager'
import {
	getLineLength as getLineLengthFromStarts,
	getLineStart,
	getLineTextLength as getLineTextLengthFromStarts,
	offsetToLineIndex,
	offsetToPosition,
	positionToOffset,
} from '../utils/position'
import { countLineBreaks } from '../utils/lineTextCache'
import type { CursorContextValue, CursorProviderProps } from './types'

const CursorContext = createContext<CursorContextValue>()

const buildLineStartsFromText = (text: string): number[] => {
	const starts: number[] = [0]
	let index = text.indexOf('\n')

	while (index !== -1) {
		starts.push(index + 1)
		index = text.indexOf('\n', index + 1)
	}

	return starts
}

const buildLineStartsFromSnapshot = (
	snapshot: PieceTableSnapshot
): number[] => {
	const starts: number[] = [0]
	if (snapshot.length === 0 || !snapshot.root) return starts

	type Node = NonNullable<typeof snapshot.root>

	const stack: Node[] = []
	let node: Node | null = snapshot.root
	let docOffset = 0

	while (node || stack.length > 0) {
		while (node) {
			stack.push(node)
			node = node.left
		}

		const current = stack.pop()
		if (!current) break

		const piece = current.piece
		const buffer =
			piece.buffer === 'original'
				? snapshot.buffers.original
				: snapshot.buffers.add
		const pieceStart = piece.start
		const pieceEnd = piece.start + piece.length

		let searchFrom = pieceStart
		while (searchFrom < pieceEnd) {
			const idx = buffer.indexOf('\n', searchFrom)
			if (idx === -1 || idx >= pieceEnd) break
			starts.push(docOffset + (idx - pieceStart) + 1)
			searchFrom = idx + 1
		}

		docOffset += piece.length
		node = current.right
	}

	return starts
}

const applyEditToLineStarts = (
	lineStarts: number[],
	startIndex: number,
	deletedText: string,
	insertedText: string
): number[] => {
	if (lineStarts.length === 0) return lineStarts

	const deletedLength = deletedText.length
	const insertedLength = insertedText.length
	const delta = insertedLength - deletedLength
	const oldEnd = startIndex + deletedLength

	const safeStarts = lineStarts.slice()

	let low = 0
	let high = safeStarts.length - 1
	let startLineIndex = 0
	while (low <= high) {
		const mid = (low + high) >> 1
		const value = safeStarts[mid] ?? 0
		if (value <= startIndex) {
			startLineIndex = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	low = 0
	high = safeStarts.length
	let firstAfterDeletion = safeStarts.length
	while (low < high) {
		const mid = (low + high) >> 1
		const value = safeStarts[mid] ?? 0
		if (value > oldEnd) {
			firstAfterDeletion = mid
			high = mid
		} else {
			low = mid + 1
		}
	}

	const nextStarts: number[] = safeStarts.slice(0, startLineIndex + 1)

	let newlineIndex = insertedText.indexOf('\n')
	while (newlineIndex !== -1) {
		nextStarts.push(startIndex + newlineIndex + 1)
		newlineIndex = insertedText.indexOf('\n', newlineIndex + 1)
	}

	for (let i = firstAfterDeletion; i < safeStarts.length; i++) {
		nextStarts.push((safeStarts[i] ?? 0) + delta)
	}

	return nextStarts
}

export function CursorProvider(props: CursorProviderProps) {
	const log = loggers.codeEditor.withTag('cursor')
	const [documentLength, setDocumentLength] = createSignal(0)
	const [lineStarts, setLineStarts] = createSignal<number[]>([])
	const [lineIds, setLineIds] = createSignal<number[]>([])
	const [activePieceTable, setActivePieceTable] = createSignal<
		PieceTableSnapshot | undefined
	>(undefined)
	const [lineDataById, setLineDataById] = createStore<
		Record<number, { text: string; length: number }>
	>({})

	let nextLineId = 1
	let lineIdIndex = new Map<number, number>()
	let pendingLineDataReset = false
	const setLineIdsWithIndex = (nextIds: number[]) => {
		setLineIds(nextIds)
		lineIdIndex = new Map<number, number>()
		for (let i = 0; i < nextIds.length; i += 1) {
			const id = nextIds[i]
			if (typeof id === 'number') {
				lineIdIndex.set(id, i)
			}
		}
	}
	const createLineIds = (count: number) => {
		const ids: number[] = new Array(Math.max(0, count))
		for (let i = 0; i < ids.length; i += 1) {
			ids[i] = nextLineId
			nextLineId += 1
		}
		return ids
	}
	const clampLineIndex = (value: number, maxIndex: number) =>
		Math.max(0, Math.min(value, maxIndex))
	const setLineData = (lineId: number, text: string, isLastLine: boolean) => {
		const length = Math.max(0, text.length + (isLastLine ? 0 : 1))
		setLineDataById(lineId, {
			text,
			length,
		})
	}
	const buildLineDataFromText = (
		content: string,
		ids: number[],
		starts: number[]
	) => {
		const data: Record<number, { text: string; length: number }> = {}
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
	const buildLineDataFromSnapshot = (
		snapshot: PieceTableSnapshot,
		ids: number[],
		starts: number[]
	) => {
		const data: Record<number, { text: string; length: number }> = {}
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
	const buildEditedLineTexts = (options: {
		startLineText: string
		endLineText: string
		startColumn: number
		endColumn: number
		insertedText: string
	}) => {
		const startText = options.startLineText
		const endText = options.endLineText
		const startColumn = Math.max(0, Math.min(options.startColumn, startText.length))
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
	const buildLineIdsForEdit = (options: {
		prevLineIds: number[]
		startLine: number
		endLine: number
		lineDelta: number
		expectedLineCount: number
	}) => {
		const expectedCount = options.expectedLineCount
		if (expectedCount <= 0) return []
		if (options.prevLineIds.length === 0) return createLineIds(expectedCount)

		const maxIndex = options.prevLineIds.length - 1
		if (maxIndex < 0) return createLineIds(expectedCount)

		const safeStart = clampLineIndex(options.startLine, maxIndex)
		const safeEnd = Math.max(
			safeStart,
			clampLineIndex(options.endLine, maxIndex)
		)
		const replacedCount = safeEnd - safeStart + 1
		const nextSegmentCount = Math.max(0, replacedCount + options.lineDelta)
		const before = options.prevLineIds.slice(0, safeStart)
		const after = options.prevLineIds.slice(safeEnd + 1)

		if (nextSegmentCount === 0) return [...before, ...after]

		const preservedId =
			options.prevLineIds[safeStart] ?? createLineIds(1)[0]
		const extraCount = Math.max(0, nextSegmentCount - 1)
		const addedIds = extraCount > 0 ? createLineIds(extraCount) : []
		const nextIds = [...before, preservedId, ...addedIds, ...after]
		return nextIds.length === expectedCount
			? nextIds
			: createLineIds(expectedCount)
	}

	const lineCount = createMemo(() => lineStarts().length)

	const getTextRange = (start: number, end: number): string => {
		const safeStart = Math.max(0, start)
		const safeEnd = Math.max(safeStart, end)

		const snapshot = activePieceTable() ?? props.pieceTable()
		if (snapshot) {
			const clampedEnd = Math.min(safeEnd, snapshot.length)
			const clampedStart = Math.min(safeStart, clampedEnd)
			return getPieceTableText(snapshot, clampedStart, clampedEnd)
		}

		const content = props.content()
		const clampedEnd = Math.min(safeEnd, content.length)
		const clampedStart = Math.min(safeStart, clampedEnd)
		return content.slice(clampedStart, clampedEnd)
	}

	const { currentState, updateCurrentState } = useCursorStateManager({
		filePath: () => props.filePath(),
		lineStarts,
		documentLength,
	})

	const syncCursorStateToDocument = () => {
		updateCurrentState(() => ({}))
	}

	const applyEdit = (
		startIndex: number,
		deletedText: string,
		insertedText: string
	) => {
		const prevLineStarts = lineStarts()
		const prevLineIds = lineIds()
		const prevDocumentLength = documentLength()
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
		let nextLineIds = prevLineIds

		if (shouldUpdateLineIds) {
			if (expectedLineCount === 0) {
				nextLineIds = []
			} else if (shouldResetLineIds) {
				nextLineIds = createLineIds(expectedLineCount)
			} else {
				nextLineIds = buildLineIdsForEdit({
					prevLineIds,
					startLine,
					endLine,
					lineDelta,
					expectedLineCount,
				})
			}
		}

		batch(() => {
			setDocumentLength((prev) =>
				Math.max(0, prev + insertedText.length - deletedText.length)
			)
			setLineStarts((prev) =>
				applyEditToLineStarts(prev, startIndex, deletedText, insertedText)
			)
			if (shouldUpdateLineIds) {
				setLineIdsWithIndex(nextLineIds)
			}
			syncCursorStateToDocument()
		})

		const nextLineCount = lineStarts().length
		if (nextLineCount !== Math.max(0, prevLineCount + lineDelta)) {
			setLineIdsWithIndex(createLineIds(nextLineCount))
			pendingLineDataReset = true
			return
		}

		if (shouldResetLineIds) {
			pendingLineDataReset = true
			return
		}

		if (nextLineCount === 0 || nextLineIds.length === 0) {
			setLineDataById(reconcile({}))
			return
		}

		if (startLine > endLine) {
			return
		}

		const maxIndex = prevLineIds.length - 1
		if (maxIndex < 0) return
		const safeStart = clampLineIndex(startLine, maxIndex)
		const safeEnd = Math.max(safeStart, clampLineIndex(endLine, maxIndex))
		const startLineId = prevLineIds[safeStart] ?? -1
		const endLineId = prevLineIds[safeEnd] ?? startLineId
		if (startLineId < 0) return

		const startLineStart = prevLineStarts[safeStart] ?? 0
		const endLineStart = prevLineStarts[safeEnd] ?? startLineStart
		const startLineText =
			lineDataById[startLineId]?.text ??
			getTextRange(
				startLineStart,
				startLineStart +
					getLineTextLengthFromStarts(
						safeStart,
						prevLineStarts,
						prevDocumentLength
					)
			)
		const endLineText =
			lineDataById[endLineId]?.text ??
			getTextRange(
				endLineStart,
				endLineStart +
					getLineTextLengthFromStarts(
						safeEnd,
						prevLineStarts,
						prevDocumentLength
					)
			)
		const startColumn = startIndex - startLineStart
		const endColumn = endOffset - endLineStart
		const nextLineTexts = buildEditedLineTexts({
			startLineText,
			endLineText,
			startColumn,
			endColumn,
			insertedText,
		})
		const nextLastLineId = nextLineIds[nextLineIds.length - 1] ?? -1
		const prevLastLineId = prevLineIds[prevLineIds.length - 1] ?? -1
		const preservedId = startLineId
		const extraCount = Math.max(0, nextLineTexts.length - 1)
		const addedIds =
			extraCount > 0
				? nextLineIds.slice(safeStart + 1, safeStart + 1 + extraCount)
				: []

		if (nextLineTexts.length > 0) {
			setLineData(
				preservedId,
				nextLineTexts[0] ?? '',
				preservedId === nextLastLineId
			)
		}

		for (let i = 0; i < addedIds.length; i += 1) {
			const lineId = addedIds[i]
			if (typeof lineId !== 'number') continue
			setLineData(
				lineId,
				nextLineTexts[i + 1] ?? '',
				lineId === nextLastLineId
			)
		}

		if (prevLastLineId !== nextLastLineId && prevLastLineId > 0) {
			const prevLast = lineDataById[prevLastLineId]
			if (prevLast) {
				setLineData(prevLastLineId, prevLast.text, false)
			}
		}
		if (nextLastLineId > 0) {
			const nextLast = lineDataById[nextLastLineId]
			if (nextLast) {
				setLineData(nextLastLineId, nextLast.text, true)
			}
		}
	}

	const getLineText = (lineIndex: number): string => {
		const ids = lineIds()
		const lineId = ids[lineIndex]
		if (lineId) {
			const data = lineDataById[lineId]
			if (data) return data.text
		}

		const starts = lineStarts()
		const length = documentLength()
		if (starts.length === 0) return ''

		const start = getLineStart(lineIndex, starts)
		const textLength = getLineTextLengthFromStarts(lineIndex, starts, length)
		return getTextRange(start, start + textLength)
	}

	let initializedPath: string | undefined
	const initializeFromSnapshot = (snapshot: PieceTableSnapshot) => {
		const length = getPieceTableLength(snapshot)
		const starts = buildLineStartsFromSnapshot(snapshot)
		const ids = createLineIds(starts.length)
		const data = buildLineDataFromSnapshot(snapshot, ids, starts)

		batch(() => {
			setActivePieceTable(snapshot)
			setDocumentLength(length)
			setLineStarts(starts)
			setLineIdsWithIndex(ids)
			setLineDataById(reconcile(data))
			syncCursorStateToDocument()
		})
		pendingLineDataReset = false

		log.debug('Initialized from piece table', {
			path: props.filePath(),
			length,
			lineCount: starts.length,
		})
	}

	const initializeFromContent = (content: string) => {
		const length = content.length
		const starts = buildLineStartsFromText(content)
		const ids = createLineIds(starts.length)
		const data = buildLineDataFromText(content, ids, starts)

		batch(() => {
			setActivePieceTable(undefined)
			setDocumentLength(length)
			setLineStarts(starts)
			setLineIdsWithIndex(ids)
			setLineDataById(reconcile(data))
			syncCursorStateToDocument()
		})
		pendingLineDataReset = false

		log.debug('Initialized from content', {
			path: props.filePath(),
			length,
			lineCount: starts.length,
		})
	}

	createEffect(() => {
		const selected = props.isFileSelected()
		const path = props.filePath()
		const snapshot = props.pieceTable()

		if (!selected || !path) {
			initializedPath = undefined
			batch(() => {
				setActivePieceTable(undefined)
				setDocumentLength(0)
				setLineStarts([])
				setLineIdsWithIndex([])
				setLineDataById(reconcile({}))
			})
			pendingLineDataReset = false
			return
		}

		if (initializedPath !== path) {
			initializedPath = path
			if (snapshot) {
				initializeFromSnapshot(snapshot)
			} else {
				initializeFromContent(props.content())
			}
			return
		}

		if (snapshot) {
			setActivePieceTable(snapshot)
			const currentLength = documentLength()
			if (lineStarts().length === 0 || currentLength !== snapshot.length) {
				initializeFromSnapshot(snapshot)
			}
		} else {
			const content = props.content()
			const currentLength = documentLength()
			if (lineStarts().length === 0 || currentLength !== content.length) {
				initializeFromContent(content)
			}
		}
	})

	const actions = useCursorActions({
		currentState,
		updateCurrentState,
		lineStarts,
		getTextRange,
		documentLength,
	})

	const getLineId = (lineIndex: number) => {
		const ids = lineIds()
		if (lineIndex < 0 || lineIndex >= ids.length) return -1
		return ids[lineIndex] ?? -1
	}

	const getLineIndex = (lineId: number) => {
		const ids = lineIds()
		if (ids.length === 0) return -1
		const index = lineIdIndex.get(lineId)
		return typeof index === 'number' ? index : -1
	}

	const value: CursorContextValue = {
		get state() {
			return currentState()
		},
		actions,
		lines: {
			lineStarts,
			lineIds,
			lineCount,
			getLineStart: (lineIndex) => getLineStart(lineIndex, lineStarts()),
			getLineLength: (lineIndex) => {
				const ids = lineIds()
				const lineId = ids[lineIndex]
				if (lineId) {
					return lineDataById[lineId]?.length ?? 0
				}
				return getLineLengthFromStarts(
					lineIndex,
					lineStarts(),
					documentLength()
				)
			},
			getLineTextLength: (lineIndex) => {
				const ids = lineIds()
				const lineId = ids[lineIndex]
				if (lineId) {
					return lineDataById[lineId]?.text.length ?? 0
				}
				return getLineTextLengthFromStarts(
					lineIndex,
					lineStarts(),
					documentLength()
				)
			},
			getLineText,
			getLineId,
			getLineIndex,
			getLineTextById: (lineId) =>
				lineDataById[lineId]?.text ?? '',
			getLineLengthById: (lineId) =>
				lineDataById[lineId]?.length ?? 0,
			getLineTextLengthById: (lineId) =>
				lineDataById[lineId]?.text.length ?? 0,
			getLineStartById: (lineId) => {
				const index = lineIdIndex.get(lineId)
				if (typeof index !== 'number') return 0
				const starts = untrack(lineStarts)
				return getLineStart(index, starts)
			},
			offsetToPosition: (offset) =>
				offsetToPosition(offset, lineStarts(), documentLength()),
			positionToOffset: (line, column) =>
				positionToOffset(line, column, lineStarts(), documentLength()),
			pieceTable: activePieceTable,
			setPieceTableSnapshot: (snapshot, options) => {
				setActivePieceTable(snapshot)
				if (snapshot && pendingLineDataReset) {
					const starts = lineStarts()
					const ids = lineIds()
					const data = buildLineDataFromSnapshot(snapshot, ids, starts)
					setLineDataById(reconcile(data))
					pendingLineDataReset = false
					return
				}
				if (options?.mode === 'incremental') return
				if (snapshot) {
					const starts = lineStarts()
					const ids = lineIds()
					const data = buildLineDataFromSnapshot(snapshot, ids, starts)
					setLineDataById(reconcile(data))
				}
				log.debug('Rebuilt line data after snapshot update', {
					mode: options?.mode ?? 'reset',
				})
			},
			applyEdit,
		},
		getTextRange,
		documentLength,
	}

	return (
		<CursorContext.Provider value={value}>
			{props.children}
		</CursorContext.Provider>
	)
}

export function useCursor(): CursorContextValue {
	const ctx = useContext(CursorContext)
	if (!ctx) {
		throw new Error('useCursor must be used within a CursorProvider')
	}
	return ctx
}
