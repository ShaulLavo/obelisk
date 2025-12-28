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
	offsetToPosition,
	positionToOffset,
} from '../utils/position'
import {
	applyEditToLineStarts,
	buildLineStartsFromSnapshot,
	buildLineStartsFromText,
	insertSingleNewlineToLineStarts,
} from '../utils/lineStarts'
import {
	buildEditedLineTexts,
	buildLineDataFromText,
	buildLineDataFromSnapshot,
	buildLineIdsForEdit,
	clampLineIndex,
	computeEditMetadata,
	createLineIdGenerator,
	type EditMetadata,
} from '../utils/lineData'
import type { CursorContextValue, CursorProviderProps } from './types'

const CursorContext = createContext<CursorContextValue>()

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
	// Revision signal that increments on any line data change.
	// Used to explicitly invalidate memos that depend on line content.
	const [lineDataRevision, setLineDataRevision] = createSignal(0)

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
	const createLineIds = createLineIdGenerator()

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

	/**
	 * Fast-path for inserting a single newline with no deletion.
	 * Returns true if handled, false if general path needed.
	 */
	const applySingleNewlineInsert = (startIndex: number): boolean => {
		const prevLineStarts = lineStarts()
		const prevLineIds = lineIds()
		const prevLineCount = prevLineStarts.length

		// Find the line containing startIndex
		let startLine = 0
		let lo = 0
		let hi = prevLineCount - 1
		while (lo <= hi) {
			const mid = (lo + hi) >> 1
			if ((prevLineStarts[mid] ?? 0) <= startIndex) {
				startLine = mid
				lo = mid + 1
			} else {
				hi = mid - 1
			}
		}

		// Validate state
		if (prevLineIds.length !== prevLineCount || prevLineIds.length === 0) {
			return false // Need full reset
		}

		const startLineId = prevLineIds[startLine]
		if (typeof startLineId !== 'number' || startLineId < 0) {
			return false
		}

		// Get current line text
		const lineStart = prevLineStarts[startLine] ?? 0
		const currentText = lineDataById[startLineId]?.text ?? ''
		const column = startIndex - lineStart

		// Split the line
		const prefix = currentText.slice(0, column)
		const suffix = currentText.slice(column)

		// Create new line ID
		const newLineId = createLineIds(1)[0]!

		// Build new line IDs array
		const nextLineIds = new Array<number>(prevLineCount + 1)
		for (let i = 0; i <= startLine; i++) {
			nextLineIds[i] = prevLineIds[i]!
		}
		nextLineIds[startLine + 1] = newLineId
		for (let i = startLine + 1; i < prevLineCount; i++) {
			nextLineIds[i + 1] = prevLineIds[i]!
		}

		const prevLastLineId = prevLineIds[prevLineCount - 1] ?? -1
		const nextLastLineId = nextLineIds[prevLineCount] ?? -1

		// Update signals
		batch(() => {
			setDocumentLength((prev) => prev + 1)
			setLineStarts((prev) => insertSingleNewlineToLineStarts(prev, startIndex))
			setLineIdsWithIndex(nextLineIds)
			syncCursorStateToDocument()
		})

		// Update line data
		batch(() => {
			// Update current line with prefix (no longer last if it was)
			const wasLast = startLineId === prevLastLineId
			const isNowLast = startLineId === nextLastLineId
			setLineDataById(startLineId, {
				text: prefix,
				length: prefix.length + (isNowLast ? 0 : 1),
			})

			// Add new line with suffix
			const newIsLast = newLineId === nextLastLineId
			setLineDataById(newLineId, {
				text: suffix,
				length: suffix.length + (newIsLast ? 0 : 1),
			})

			// Update previous last line if it changed
			if (wasLast && !isNowLast && prevLastLineId > 0) {
				const prevLast = lineDataById[prevLastLineId]
				if (prevLast && prevLast !== lineDataById[startLineId]) {
					setLineDataById(prevLastLineId, {
						text: prevLast.text,
						length: prevLast.text.length + 1,
					})
				}
			}

			setLineDataRevision((v) => v + 1)
		})

		return true
	}

	/**
	 * Fast-path for inserting a single non-newline character with no deletion.
	 * Common case: typing a letter, space, etc.
	 * Returns true if handled, false if general path needed.
	 */
	const applySingleCharInsert = (startIndex: number, char: string): boolean => {
		const prevLineStarts = lineStarts()
		const prevLineIds = lineIds()
		const prevLineCount = prevLineStarts.length

		if (prevLineIds.length !== prevLineCount || prevLineCount === 0) {
			return false
		}

		// Find the line containing startIndex
		let lineIdx = 0
		let lo = 0
		let hi = prevLineCount - 1
		while (lo <= hi) {
			const mid = (lo + hi) >> 1
			if ((prevLineStarts[mid] ?? 0) <= startIndex) {
				lineIdx = mid
				lo = mid + 1
			} else {
				hi = mid - 1
			}
		}

		const lineId = prevLineIds[lineIdx]
		if (typeof lineId !== 'number' || lineId < 0) {
			return false
		}

		const lineStart = prevLineStarts[lineIdx] ?? 0
		const currentText = lineDataById[lineId]?.text ?? ''
		const column = startIndex - lineStart
		const isLastLine = lineIdx === prevLineCount - 1

		// Insert character into text
		const newText =
			currentText.slice(0, column) + char + currentText.slice(column)

		// Update lineStarts: shift all lines after this one by 1
		const newLineStarts = new Array<number>(prevLineCount)
		for (let i = 0; i <= lineIdx; i++) {
			newLineStarts[i] = prevLineStarts[i]!
		}
		for (let i = lineIdx + 1; i < prevLineCount; i++) {
			newLineStarts[i] = prevLineStarts[i]! + 1
		}

		batch(() => {
			setDocumentLength((prev) => prev + 1)
			setLineStarts(newLineStarts)
			syncCursorStateToDocument()
		})

		batch(() => {
			setLineDataById(lineId, {
				text: newText,
				length: newText.length + (isLastLine ? 0 : 1),
			})
			setLineDataRevision((v) => v + 1)
		})

		return true
	}

	const computeNextLineIds = (meta: EditMetadata): number[] => {
		if (!meta.shouldUpdateLineIds) return meta.prevLineIds
		if (meta.expectedLineCount === 0) return []
		if (meta.shouldResetLineIds) return createLineIds(meta.expectedLineCount)

		return buildLineIdsForEdit(
			{
				prevLineIds: meta.prevLineIds,
				startLine: meta.startLine,
				endLine: meta.endLine,
				lineDelta: meta.lineDelta,
				expectedLineCount: meta.expectedLineCount,
			},
			createLineIds
		)
	}

	const applyEditSignals = (
		startIndex: number,
		deletedText: string,
		insertedText: string,
		meta: EditMetadata,
		nextLineIds: number[]
	) =>
		batch(() => {
			setDocumentLength((prev) =>
				Math.max(0, prev + insertedText.length - deletedText.length)
			)
			setLineStarts((prev) =>
				applyEditToLineStarts(prev, startIndex, deletedText, insertedText)
			)
			if (meta.shouldUpdateLineIds) {
				setLineIdsWithIndex(nextLineIds)
			}
			syncCursorStateToDocument()
		})

	type LineDataUpdateParams = {
		nextLineTexts: string[]
		preservedId: number
		addedIds: number[]
		prevLastLineId: number
		nextLastLineId: number
	}

	const commitLineDataUpdates = (params: LineDataUpdateParams) => {
		const {
			nextLineTexts,
			preservedId,
			addedIds,
			prevLastLineId,
			nextLastLineId,
		} = params

		batch(() => {
			if (nextLineTexts.length > 0) {
				const text = nextLineTexts[0] ?? ''
				const isLast = preservedId === nextLastLineId
				const length = Math.max(0, text.length + (isLast ? 0 : 1))
				setLineDataById(preservedId, { text, length })
			}

			for (let i = 0; i < addedIds.length; i += 1) {
				const lineId = addedIds[i]
				if (typeof lineId !== 'number') continue
				const text = nextLineTexts[i + 1] ?? ''
				const isLast = lineId === nextLastLineId
				const length = Math.max(0, text.length + (isLast ? 0 : 1))
				setLineDataById(lineId, { text, length })
			}

			if (prevLastLineId !== nextLastLineId && prevLastLineId > 0) {
				const prevLast = lineDataById[prevLastLineId]
				if (prevLast) {
					const length = Math.max(0, prevLast.text.length + 1)
					setLineDataById(prevLastLineId, { text: prevLast.text, length })
				}
			}
			if (nextLastLineId > 0) {
				const nextLast = lineDataById[nextLastLineId]
				if (nextLast) {
					const length = nextLast.text.length
					setLineDataById(nextLastLineId, { text: nextLast.text, length })
				}
			}

			setLineDataRevision((v) => v + 1)
		})
	}

	const updateLineDataForEdit = (
		startIndex: number,
		insertedText: string,
		meta: EditMetadata,
		nextLineIds: number[]
	): boolean => {
		const nextLineCount = lineStarts().length
		if (nextLineCount !== Math.max(0, meta.prevLineCount + meta.lineDelta)) {
			batch(() => {
				setLineIdsWithIndex(createLineIds(nextLineCount))
				setLineDataRevision((v) => v + 1)
			})
			pendingLineDataReset = true
			return false
		}

		if (meta.shouldResetLineIds) {
			pendingLineDataReset = true
			setLineDataRevision((v) => v + 1)
			return false
		}

		if (nextLineCount === 0 || nextLineIds.length === 0) {
			batch(() => {
				setLineDataById(reconcile({}))
				setLineDataRevision((v) => v + 1)
			})
			return false
		}

		if (meta.startLine > meta.endLine) {
			setLineDataRevision((v) => v + 1)
			return false
		}

		const maxIndex = meta.prevLineIds.length - 1
		if (maxIndex < 0) {
			setLineDataRevision((v) => v + 1)
			return false
		}

		const safeStart = clampLineIndex(meta.startLine, maxIndex)
		const safeEnd = Math.max(safeStart, clampLineIndex(meta.endLine, maxIndex))
		const startLineId = meta.prevLineIds[safeStart] ?? -1
		if (startLineId < 0) {
			setLineDataRevision((v) => v + 1)
			return false
		}

		const startLineStart = meta.prevLineStarts[safeStart] ?? 0
		const endLineStart = meta.prevLineStarts[safeEnd] ?? startLineStart

		const startTextLen = getLineTextLengthFromStarts(
			safeStart,
			meta.prevLineStarts,
			meta.prevDocumentLength
		)
		const startLineText =
			lineDataById[startLineId]?.text ??
			getTextRange(startLineStart, startLineStart + startTextLen)

		const endLineId = meta.prevLineIds[safeEnd] ?? startLineId
		const endTextLen = getLineTextLengthFromStarts(
			safeEnd,
			meta.prevLineStarts,
			meta.prevDocumentLength
		)
		const endLineText =
			lineDataById[endLineId]?.text ??
			getTextRange(endLineStart, endLineStart + endTextLen)

		const startColumn = startIndex - startLineStart
		const endColumn = meta.endOffset - endLineStart
		const nextLineTexts = buildEditedLineTexts({
			startLineText,
			endLineText,
			startColumn,
			endColumn,
			insertedText,
		})

		const nextLastLineId = nextLineIds[nextLineIds.length - 1] ?? -1
		const prevLastLineId = meta.prevLineIds[meta.prevLineIds.length - 1] ?? -1
		const preservedId = startLineId
		const extraCount = Math.max(0, nextLineTexts.length - 1)
		const addedIds =
			extraCount > 0
				? nextLineIds.slice(safeStart + 1, safeStart + 1 + extraCount)
				: []

		commitLineDataUpdates({
			nextLineTexts,
			preservedId,
			addedIds,
			prevLastLineId,
			nextLastLineId,
		})

		return true
	}

	const applyEdit = (
		startIndex: number,
		deletedText: string,
		insertedText: string
	) => {
		// Fast paths for common single-character operations
		if (insertedText === '\n' && deletedText.length === 0) {
			if (applySingleNewlineInsert(startIndex)) return
		}
		if (
			insertedText.length === 1 &&
			insertedText !== '\n' &&
			deletedText.length === 0
		) {
			if (applySingleCharInsert(startIndex, insertedText)) return
		}

		// General path
		const meta = computeEditMetadata(startIndex, deletedText, insertedText, {
			lineStarts: lineStarts(),
			lineIds: lineIds(),
			documentLength: documentLength(),
		})
		const nextLineIds = computeNextLineIds(meta)
		applyEditSignals(startIndex, deletedText, insertedText, meta, nextLineIds)
		updateLineDataForEdit(startIndex, insertedText, meta, nextLineIds)
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
			getLineTextById: (lineId) => lineDataById[lineId]?.text ?? '',
			getLineLengthById: (lineId) => lineDataById[lineId]?.length ?? 0,
			getLineTextLengthById: (lineId) => lineDataById[lineId]?.text.length ?? 0,
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
			lineDataRevision,
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
