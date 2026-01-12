import { batch } from 'solid-js'
import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type { VisibleContentSnapshot } from '@repo/code-editor'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'
import { createFilePath, type FilePath } from '@repo/fs'
import { createFileStateStore } from '../store'
import { createIndexedDBBackend } from '../store/IndexedDBBackend'
import { timestamp } from '../freshness'
import type { SyntaxData, ScrollPosition } from '../store/types'
import type { FsState } from '../types'

export type { ScrollPosition }

export const DISABLE_CACHE = false as const

export type FileCacheEntry = {
	pieceTable?: PieceTableSnapshot
	stats?: ParseResult
	previewBytes?: Uint8Array
	highlights?: TreeSitterCapture[]
	folds?: FoldRange[]
	brackets?: BracketInfo[]
	errors?: TreeSitterError[]
	scrollPosition?: ScrollPosition
	visibleContent?: VisibleContentSnapshot
	lineStarts?: number[]
}

export type CacheStats = {
	memoryEntries: number
	persistedEntries: number
	totalSize: number
}

export type FileCacheController = {
	get: (path: string) => FileCacheEntry
	set: (path: string, entry: FileCacheEntry) => void
	clearPath: (path: string) => void
	clearContent: (path: string) => void
	clearBuffer: (path: string) => void
	clearAll: () => void
	clearMemory: () => void
	getAsync: (path: string) => Promise<FileCacheEntry>
	getScrollPosition: (path: string) => ScrollPosition | undefined
	getLineStarts: (path: string) => number[] | undefined
	setActiveFile: (path: string | null) => void
	setOpenTabs: (paths: string[]) => void
	getStats: () => Promise<CacheStats>
	flush: () => Promise<void>
}

const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

type FileCacheControllerOptions = {
	state: Pick<
		FsState,
		| 'pieceTables'
		| 'fileStats'
		| 'fileHighlights'
		| 'fileFolds'
		| 'fileBrackets'
		| 'fileErrors'
		| 'scrollPositions'
		| 'visibleContents'
	>
	setPieceTable: (path: string, snapshot?: PieceTableSnapshot) => void
	setFileStats: (path: string, stats?: ParseResult) => void
	setHighlights: (path: string, highlights?: TreeSitterCapture[]) => void
	setFolds: (path: string, folds?: FoldRange[]) => void
	setBrackets: (path: string, brackets?: BracketInfo[]) => void
	setErrors: (path: string, errors?: TreeSitterError[]) => void
	setScrollPosition: (path: string, position?: ScrollPosition) => void
	setVisibleContent: (path: string, content?: VisibleContentSnapshot) => void
}

export const createFileCacheControllerV2 = ({
	state,
	setPieceTable,
	setFileStats,
	setHighlights,
	setFolds,
	setBrackets,
	setErrors,
	setScrollPosition,
	setVisibleContent,
}: FileCacheControllerOptions): FileCacheController => {
	const store = createFileStateStore({
		persistence: createIndexedDBBackend(),
		persistenceDebounceMs: 150,
	})
	const previews: Record<string, Uint8Array | undefined> = {}

	const toFilePath = (path: string): FilePath => createFilePath(path)

	const get = (path: string): FileCacheEntry => {
		if (DISABLE_CACHE) return {}
		const p = normalizePath(path)

		return {
			pieceTable: state.pieceTables[p],
			stats: state.fileStats[p],
			previewBytes: previews[p],
			highlights: state.fileHighlights[p],
			folds: state.fileFolds[p],
			brackets: state.fileBrackets[p],
			errors: state.fileErrors[p],
			scrollPosition: state.scrollPositions[p],
			visibleContent: state.visibleContents[p],
		}
	}

	const set = (path: string, entry: FileCacheEntry) => {
		if (!path || DISABLE_CACHE) return
		const p = normalizePath(path)

		batch(() => {
			if (entry.pieceTable !== undefined) setPieceTable(p, entry.pieceTable)
			if (entry.stats !== undefined) setFileStats(p, entry.stats)
			if (entry.highlights !== undefined) setHighlights(p, entry.highlights)
			if (entry.folds !== undefined) setFolds(p, entry.folds)
			if (entry.brackets !== undefined) setBrackets(p, entry.brackets)
			if (entry.errors !== undefined) setErrors(p, entry.errors)
			if (entry.scrollPosition !== undefined) setScrollPosition(p, entry.scrollPosition)
			if (entry.visibleContent !== undefined) setVisibleContent(p, entry.visibleContent)
			if (entry.previewBytes !== undefined) previews[p] = entry.previewBytes
		})

		const fp = toFilePath(p)
		store.update(fp, {
			...(entry.pieceTable !== undefined && {
				pieceTable: timestamp(entry.pieceTable),
			}),
			...(entry.stats !== undefined && {
				stats: timestamp(entry.stats),
			}),
			...((entry.highlights !== undefined ||
				entry.folds !== undefined ||
				entry.brackets !== undefined ||
				entry.errors !== undefined) && {
				syntax: timestamp<SyntaxData>({
					highlights: entry.highlights ?? [],
					brackets: entry.brackets ?? [],
					folds: entry.folds ?? [],
					errors: entry.errors ?? [],
				}),
			}),
			...(entry.scrollPosition !== undefined && {
				scrollPosition: timestamp(entry.scrollPosition),
			}),
			...(entry.visibleContent !== undefined && {
				visibleContent: timestamp(entry.visibleContent),
			}),
			...(entry.previewBytes !== undefined && {
				previewBytes: entry.previewBytes,
			}),
		})
	}

	const clearBuffer = (path: string) => {
		if (!path) return
		const p = normalizePath(path)
		setPieceTable(p, undefined)
	}

	const clearContent = (path: string) => {
		if (!path) return
		const p = normalizePath(path)
		batch(() => {
			setPieceTable(p, undefined)
			setFileStats(p, undefined)
			setHighlights(p, undefined)
			setFolds(p, undefined)
			setBrackets(p, undefined)
			setErrors(p, undefined)
			delete previews[p]
		})
	}

	const clearPath = (path: string) => {
		if (!path) return
		const p = normalizePath(path)
		batch(() => {
			setPieceTable(p, undefined)
			setFileStats(p, undefined)
			setHighlights(p, undefined)
			setFolds(p, undefined)
			setBrackets(p, undefined)
			setErrors(p, undefined)
			setScrollPosition(p, undefined)
			setVisibleContent(p, undefined)
			delete previews[p]
		})
		store.remove(toFilePath(p)).catch((error) => {
			console.warn(`FileCacheControllerV2: Failed to clear path ${p}:`, error)
		})
	}

	const clearAll = () => {
		batch(() => {
			for (const path of Object.keys(state.pieceTables)) setPieceTable(path, undefined)
			for (const path of Object.keys(state.fileStats)) setFileStats(path, undefined)
			for (const path of Object.keys(state.fileHighlights)) setHighlights(path, undefined)
			for (const path of Object.keys(state.fileFolds)) setFolds(path, undefined)
			for (const path of Object.keys(state.fileBrackets)) setBrackets(path, undefined)
			for (const path of Object.keys(state.fileErrors)) setErrors(path, undefined)
			for (const path of Object.keys(state.scrollPositions)) setScrollPosition(path, undefined)
			for (const path of Object.keys(state.visibleContents)) setVisibleContent(path, undefined)
			for (const path of Object.keys(previews)) delete previews[path]
		})
		store.clear().catch((error) => {
			console.warn('FileCacheControllerV2: Failed to clear all:', error)
		})
	}

	const clearMemory = () => {
		batch(() => {
			for (const path of Object.keys(state.pieceTables)) setPieceTable(path, undefined)
			for (const path of Object.keys(state.fileStats)) setFileStats(path, undefined)
			for (const path of Object.keys(state.fileHighlights)) setHighlights(path, undefined)
			for (const path of Object.keys(state.fileFolds)) setFolds(path, undefined)
			for (const path of Object.keys(state.fileBrackets)) setBrackets(path, undefined)
			for (const path of Object.keys(state.fileErrors)) setErrors(path, undefined)
			for (const path of Object.keys(state.scrollPositions)) setScrollPosition(path, undefined)
			for (const path of Object.keys(state.visibleContents)) setVisibleContent(path, undefined)
			for (const path of Object.keys(previews)) delete previews[path]
		})
	}

	const getAsync = async (path: string): Promise<FileCacheEntry> => {
		if (DISABLE_CACHE) return {}
		const p = normalizePath(path)

		const memoryEntry = get(p)
		const hasMemoryData = Object.keys(memoryEntry).some(
			(key) => memoryEntry[key as keyof FileCacheEntry] !== undefined
		)
		if (hasMemoryData) return memoryEntry

		const fp = toFilePath(p)
		const persistedState = await store.getAsync(fp)
		if (!persistedState) return {}

		const entry: FileCacheEntry = {
			pieceTable: persistedState.pieceTable?.value,
			stats: persistedState.stats?.value,
			previewBytes: persistedState.previewBytes ?? undefined,
			highlights: persistedState.syntax?.value.highlights,
			folds: persistedState.syntax?.value.folds,
			brackets: persistedState.syntax?.value.brackets,
			errors: persistedState.syntax?.value.errors,
			scrollPosition: persistedState.scrollPosition?.value,
			visibleContent: persistedState.visibleContent?.value,
			lineStarts: persistedState.lineStarts ?? undefined,
		}

		batch(() => {
			if (entry.pieceTable) setPieceTable(p, entry.pieceTable)
			if (entry.stats) setFileStats(p, entry.stats)
			if (entry.highlights) setHighlights(p, entry.highlights)
			if (entry.folds) setFolds(p, entry.folds)
			if (entry.brackets) setBrackets(p, entry.brackets)
			if (entry.errors) setErrors(p, entry.errors)
			if (entry.scrollPosition) setScrollPosition(p, entry.scrollPosition)
			if (entry.visibleContent) setVisibleContent(p, entry.visibleContent)
			if (entry.previewBytes) previews[p] = entry.previewBytes
		})

		return entry
	}

	const getScrollPosition = (path: string): ScrollPosition | undefined => {
		const p = normalizePath(path)
		return state.scrollPositions[p]
	}

	const getLineStarts = (path: string): number[] | undefined => {
		const p = normalizePath(path)
		return state.fileStats[p]?.lineStarts
	}

	const setActiveFile = (_path: string | null): void => {}
	const setOpenTabs = (_paths: string[]): void => {}

	const getStats = async (): Promise<CacheStats> => ({
		memoryEntries: store.size,
		persistedEntries: 0,
		totalSize: 0,
	})

	const flush = async (): Promise<void> => {
		await store.flush()
	}

	return {
		get,
		set,
		clearPath,
		clearContent,
		clearBuffer,
		clearAll,
		clearMemory,
		getAsync,
		getScrollPosition,
		getLineStarts,
		setActiveFile,
		setOpenTabs,
		getStats,
		flush,
	}
}
