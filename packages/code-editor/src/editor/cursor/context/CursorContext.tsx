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
	useContext,
} from 'solid-js'
import { useCursorActions } from '../hooks/useCursorActions'
import { useCursorStateManager } from '../hooks/useCursorStateManager'
import {
	getLineLength,
	getLineStart,
	getLineTextLength,
	offsetToPosition,
	positionToOffset,
} from '../utils/position'
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

const validateLineStarts = (
	lineStarts: number[],
	documentLength: number,
	context: string
) => {
	if (lineStarts.length === 0) {
		console.assert(false, `[code-editor] lineStarts empty (${context})`)
		return
	}

	if (lineStarts[0] !== 0) {
		console.assert(
			false,
			`[code-editor] lineStarts[0] must be 0 (${context})`,
			{ first: lineStarts[0] }
		)
	}

	const last = lineStarts[lineStarts.length - 1] ?? 0
	if (last < 0 || last > documentLength) {
		console.assert(
			false,
			`[code-editor] lineStarts last out of range (${context})`,
			{ last, documentLength }
		)
	}

	const sampleSize = 64
	const startWindow = Math.min(lineStarts.length, sampleSize)
	for (let i = 1; i < startWindow; i++) {
		const prev = lineStarts[i - 1] ?? 0
		const current = lineStarts[i] ?? 0
		if (current <= prev) {
			console.assert(
				false,
				`[code-editor] lineStarts not strictly increasing (${context})`,
				{ index: i, prev, current }
			)
			break
		}
	}

	const tailStart = Math.max(1, lineStarts.length - sampleSize)
	for (let i = tailStart; i < lineStarts.length; i++) {
		const prev = lineStarts[i - 1] ?? 0
		const current = lineStarts[i] ?? 0
		if (current <= prev) {
			console.assert(
				false,
				`[code-editor] lineStarts not strictly increasing near end (${context})`,
				{ index: i, prev, current }
			)
			break
		}
	}
}

export function CursorProvider(props: CursorProviderProps) {
	const log = loggers.codeEditor.withTag('cursor')
	const [documentLength, setDocumentLength] = createSignal(0)
	const [lineStarts, setLineStarts] = createSignal<number[]>([])

	const lineCount = createMemo(() => lineStarts().length)

	const getTextRange = (start: number, end: number): string => {
		const safeStart = Math.max(0, start)
		const safeEnd = Math.max(safeStart, end)

		const snapshot = props.pieceTable()
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

	const MAX_CACHED_LINES = 2000
	const lineTextCache = new Map<number, string>()

	const applyEdit = (
		startIndex: number,
		deletedText: string,
		insertedText: string
	) => {
		batch(() => {
			setDocumentLength((prev) =>
				Math.max(0, prev + insertedText.length - deletedText.length)
			)
			setLineStarts((prev) =>
				applyEditToLineStarts(prev, startIndex, deletedText, insertedText)
			)
		})
		lineTextCache.clear()
	}

	const getLineText = (lineIndex: number): string => {
		const cached = lineTextCache.get(lineIndex)
		if (cached !== undefined) {
			lineTextCache.delete(lineIndex)
			lineTextCache.set(lineIndex, cached)
			return cached
		}

		const starts = lineStarts()
		const length = documentLength()
		if (starts.length === 0) return ''

		const start = getLineStart(lineIndex, starts)
		const textLength = getLineTextLength(lineIndex, starts, length)
		const text = getTextRange(start, start + textLength)
		lineTextCache.set(lineIndex, text)
		while (lineTextCache.size > MAX_CACHED_LINES) {
			const oldestKey = lineTextCache.keys().next().value
			if (typeof oldestKey !== 'number') break
			lineTextCache.delete(oldestKey)
		}
		return text
	}

	let initializedPath: string | undefined
	const initializeFromSnapshot = (snapshot: PieceTableSnapshot) => {
		const length = getPieceTableLength(snapshot)
		const starts = buildLineStartsFromSnapshot(snapshot)
		validateLineStarts(starts, length, 'initializeFromSnapshot')

		batch(() => {
			setDocumentLength(length)
			setLineStarts(starts)
		})
		lineTextCache.clear()

		log.debug('Initialized from piece table', {
			path: props.filePath(),
			length,
			lineCount: starts.length,
		})
	}

	const initializeFromContent = (content: string) => {
		const length = content.length
		const starts = buildLineStartsFromText(content)
		validateLineStarts(starts, length, 'initializeFromContent')

		batch(() => {
			setDocumentLength(length)
			setLineStarts(starts)
		})
		lineTextCache.clear()

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
				setDocumentLength(0)
				setLineStarts([])
			})
			lineTextCache.clear()
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

	const { currentState, updateCurrentState } = useCursorStateManager({
		filePath: () => props.filePath(),
		lineStarts,
		documentLength,
	})

	const actions = useCursorActions({
		currentState,
		updateCurrentState,
		lineStarts,
		getTextRange,
		documentLength,
	})

	const value: CursorContextValue = {
		get state() {
			return currentState()
		},
		actions,
		lines: {
			lineStarts,
			lineCount,
			getLineStart: (lineIndex) => getLineStart(lineIndex, lineStarts()),
			getLineLength: (lineIndex) =>
				getLineLength(lineIndex, lineStarts(), documentLength()),
			getLineTextLength: (lineIndex) =>
				getLineTextLength(lineIndex, lineStarts(), documentLength()),
			getLineText,
			offsetToPosition: (offset) =>
				offsetToPosition(offset, lineStarts(), documentLength()),
			positionToOffset: (line, column) =>
				positionToOffset(line, column, lineStarts(), documentLength()),
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
