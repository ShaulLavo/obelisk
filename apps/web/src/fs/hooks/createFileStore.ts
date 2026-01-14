import { batch } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { createFilePath, type FilePath } from '@repo/fs'
import { type ParseResult, type PieceTableSnapshot, getCachedPieceTableContent, createPieceTableSnapshot } from '@repo/utils'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'
import type { FileLoadingError } from '../../split-editor/fileLoadingErrors'
import {
	type FileState,
	type FileLoadingState,
	type SyntaxData,
	type HighlightTransform,
	createEmptyFileState,
} from '../store/types'

export type FileStore = ReturnType<typeof createFileStore>

const buildLineStartsFromText = (text: string): number[] => {
	const starts: number[] = [0]
	let index = text.indexOf('\n')
	while (index !== -1) {
		starts.push(index + 1)
		index = text.indexOf('\n', index + 1)
	}
	return starts
}

export const createFileStore = () => {
	const [files, setFiles] = createStore<Record<FilePath, FileState>>({})
	const [highlightOffsets, setHighlightOffsets] = createStore<
		Record<FilePath, HighlightTransform[] | undefined>
	>({})
	const savedContents: Record<FilePath, string> = {}

	const ensureFile = (path: FilePath): void => {
		if (!files[path]) {
			setFiles(path, createEmptyFileState(path))
		}
	}

	const getFile = (path: string): FileState | undefined => {
		const p = createFilePath(path)
		return files[p]
	}

	const setPieceTable = (path: string, value: PieceTableSnapshot | null) => {
		const p = createFilePath(path)
		ensureFile(p)
		setFiles(p, 'pieceTable', value)
		setFiles(p, 'lastAccessed', Date.now())
	}

	const setStats = (path: string, value: ParseResult | null) => {
		const p = createFilePath(path)
		ensureFile(p)
		setFiles(p, 'stats', value)
	}

	const setSyntax = (path: string, data: SyntaxData | null) => {
		const p = createFilePath(path)
		ensureFile(p)
		setFiles(p, 'syntax', data)
	}

	const setHighlights = (path: string, highlights?: TreeSitterCapture[]) => {
		const p = createFilePath(path)
		ensureFile(p)
		const current = files[p]?.syntax
		const nextHighlights = highlights?.length ? highlights : []
		const hasOffsets = (highlightOffsets[p]?.length ?? 0) > 0

		batch(() => {
			if (hasOffsets) {
				setHighlightOffsets(p, undefined)
			}
			setFiles(p, 'syntax', {
				highlights: nextHighlights,
				brackets: current?.brackets ?? [],
				folds: current?.folds ?? [],
				errors: current?.errors ?? [],
			})
		})
	}

	const applyHighlightOffset = (path: string, transform: HighlightTransform) => {
		if (!path) return
		const p = createFilePath(path)

		const normalizedStart = transform.fromCharIndex
		const normalizedOldEnd = Math.max(normalizedStart, transform.oldEndIndex)
		const normalizedNewEnd = Math.max(normalizedStart, transform.newEndIndex)
		const normalizedCharDelta = normalizedNewEnd - normalizedOldEnd

		const normalizedOldEndRow = Math.max(transform.fromLineRow, transform.oldEndRow)
		const normalizedNewEndRow = Math.max(transform.fromLineRow, transform.newEndRow)
		const normalizedLineDelta = normalizedNewEndRow - normalizedOldEndRow

		const incoming: HighlightTransform = {
			...transform,
			charDelta: normalizedCharDelta,
			lineDelta: normalizedLineDelta,
			oldEndRow: normalizedOldEndRow,
			newEndRow: normalizedNewEndRow,
			oldEndIndex: normalizedOldEnd,
			newEndIndex: normalizedNewEnd,
		}

		const existing = highlightOffsets[p]

		if (existing && existing.length > 0) {
			const last = existing[existing.length - 1]!

			const isBackspacing =
				last.lineDelta === 0 &&
				incoming.lineDelta === 0 &&
				last.charDelta < 0 &&
				incoming.charDelta === -1 &&
				incoming.fromCharIndex === last.fromCharIndex - 1

			if (isBackspacing) {
				const merged: HighlightTransform = {
					...last,
					fromCharIndex: incoming.fromCharIndex,
					charDelta: last.charDelta + incoming.charDelta,
					oldEndIndex: last.oldEndIndex,
					newEndIndex: incoming.newEndIndex,
				}
				const nextOffsets = [...existing]
				nextOffsets[existing.length - 1] = merged
				setHighlightOffsets(p, nextOffsets)
				return
			}

			const isTyping =
				last.lineDelta === 0 &&
				incoming.lineDelta === 0 &&
				incoming.charDelta > 0 &&
				incoming.fromCharIndex === last.fromCharIndex + last.charDelta

			if (isTyping) {
				const merged: HighlightTransform = {
					...last,
					charDelta: last.charDelta + incoming.charDelta,
					newEndIndex: incoming.newEndIndex,
				}
				const nextOffsets = [...existing]
				nextOffsets[existing.length - 1] = merged
				setHighlightOffsets(p, nextOffsets)
				return
			}
		}

		const nextOffsets = existing ? [...existing, incoming] : [incoming]
		setHighlightOffsets(p, nextOffsets)
	}

	const setBrackets = (path: string, brackets: BracketInfo[]) => {
		const p = createFilePath(path)
		ensureFile(p)
		const current = files[p]?.syntax
		setFiles(p, 'syntax', {
			highlights: current?.highlights ?? [],
			brackets,
			folds: current?.folds ?? [],
			errors: current?.errors ?? [],
		})
	}

	const setFolds = (path: string, folds: FoldRange[]) => {
		const p = createFilePath(path)
		ensureFile(p)
		const current = files[p]?.syntax
		setFiles(p, 'syntax', {
			highlights: current?.highlights ?? [],
			brackets: current?.brackets ?? [],
			folds,
			errors: current?.errors ?? [],
		})
	}

	const setErrors = (path: string, errors: TreeSitterError[]) => {
		const p = createFilePath(path)
		ensureFile(p)
		const current = files[p]?.syntax
		setFiles(p, 'syntax', {
			highlights: current?.highlights ?? [],
			brackets: current?.brackets ?? [],
			folds: current?.folds ?? [],
			errors,
		})
	}

	const setFullSyntax = (
		path: string,
		highlights: TreeSitterCapture[],
		brackets: BracketInfo[],
		folds: FoldRange[],
		errors: TreeSitterError[]
	) => {
		const p = createFilePath(path)
		ensureFile(p)
		setFiles(p, 'syntax', { highlights, brackets, folds, errors })
	}

	const setLoadingState = (path: string, state: FileLoadingState) => {
		const p = createFilePath(path)
		ensureFile(p)
		setFiles(p, 'loadingState', state)
	}

	const setDirty = (path: string, isDirty: boolean) => {
		const p = createFilePath(path)
		ensureFile(p)
		setFiles(p, 'isDirty', isDirty)
	}

	const setSavedContent = (path: string, content: string) => {
		const p = createFilePath(path)
		savedContents[p] = content
	}

	const clearSavedContent = (path: string) => {
		const p = createFilePath(path)
		delete savedContents[p]
	}

	const updateDirtyFromPieceTable = (path: string, pieceTable: PieceTableSnapshot | undefined) => {
		const p = createFilePath(path)
		const saved = savedContents[p]
		if (saved === undefined) return

		if (!pieceTable) {
			setDirty(p, false)
			return
		}

		const currentContent = getCachedPieceTableContent(pieceTable)
		setDirty(p, currentContent !== saved)
	}

	const setLoadingError = (path: string, error: FileLoadingError | null) => {
		const p = createFilePath(path)
		ensureFile(p)
		if (error) {
			setFiles(p, 'loadingState', { status: 'error', error })
		}
	}

	const preloadFileContent = (path: string, content: string) => {
		const p = createFilePath(path)
		ensureFile(p)
		const pieceTable = createPieceTableSnapshot(content)
		batch(() => {
			setFiles(p, 'pieceTable', pieceTable)
			setFiles(p, 'loadingState', { status: 'loaded' })
			setFiles(p, 'lineStarts', buildLineStartsFromText(content))
		})
		savedContents[p] = content
	}

	const setPreviewBytes = (path: string, bytes: Uint8Array | null) => {
		const p = createFilePath(path)
		ensureFile(p)
		setFiles(p, 'previewBytes', bytes)
	}

	const setLineStarts = (path: string, lineStarts: number[] | null) => {
		const p = createFilePath(path)
		ensureFile(p)
		setFiles(p, 'lineStarts', lineStarts)
	}

	const setDiskMtime = (path: string, mtime: number | null) => {
		const p = createFilePath(path)
		ensureFile(p)
		setFiles(p, 'diskMtime', mtime)
	}

	const removeFile = (path: string) => {
		const p = createFilePath(path)
		delete savedContents[p]
		setFiles(p, undefined!)
	}

	const clearAll = () => {
		batch(() => {
			setFiles(reconcile({}))
			setHighlightOffsets(reconcile({}))
		})
		for (const key of Object.keys(savedContents)) {
			delete savedContents[key as FilePath]
		}
	}

	const clearSyntax = () => {
		batch(() => {
			setHighlightOffsets(reconcile({}))
			for (const path of Object.keys(files) as FilePath[]) {
				setFiles(path, 'syntax', null)
			}
		})
	}

	return {
		files,
		highlightOffsets,
		getFile,
		setPieceTable,
		setStats,
		setSyntax,
		setHighlights,
		applyHighlightOffset,
		setBrackets,
		setFolds,
		setErrors,
		setFullSyntax,
		setLoadingState,
		setLoadingError,
		setDirty,
		setSavedContent,
		clearSavedContent,
		updateDirtyFromPieceTable,
		preloadFileContent,
		setPreviewBytes,
		setLineStarts,
		setDiskMtime,
		removeFile,
		clearAll,
		clearSyntax,
	}
}
