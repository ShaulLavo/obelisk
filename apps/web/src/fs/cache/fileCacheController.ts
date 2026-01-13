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
import type { SyntaxData, ScrollPosition, CursorPosition, SelectionRange } from '../store/types'
import type { ViewMode } from '../types/ViewMode'
import type { FsState } from '../types'
import { createLocalStorageCache } from './LocalStorageCache'
import {
	createReactiveFileState,
	type ReactiveFileState,
} from '../store/ReactiveFileState'

// Types should be imported directly from store/types, not re-exported here

export const DISABLE_CACHE = false as const

export type FileCacheEntry = {
	// Content state (IndexedDB)
	pieceTable?: PieceTableSnapshot
	stats?: ParseResult
	previewBytes?: Uint8Array
	highlights?: TreeSitterCapture[]
	folds?: FoldRange[]
	brackets?: BracketInfo[]
	errors?: TreeSitterError[]
	lineStarts?: number[]
	// View state (localStorage)
	scrollPosition?: ScrollPosition
	cursorPosition?: CursorPosition
	selections?: SelectionRange[]
	visibleContent?: VisibleContentSnapshot
	viewMode?: ViewMode
	isDirty?: boolean
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
	/** Get or create a ReactiveFileState for a path (Resource-based) */
	getFileState: (path: string) => ReactiveFileState
	/** Check if a ReactiveFileState exists for a path */
	hasFileState: (path: string) => boolean
	/** Remove a ReactiveFileState for a path */
	removeFileState: (path: string) => void
}

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
		| 'cursorPositions'
		| 'fileSelections'
		| 'visibleContents'
		| 'fileViewModes'
		| 'dirtyPaths'
	>
	setPieceTable: (path: string, snapshot?: PieceTableSnapshot) => void
	setFileStats: (path: string, stats?: ParseResult) => void
	setHighlights: (path: string, highlights?: TreeSitterCapture[]) => void
	setFolds: (path: string, folds?: FoldRange[]) => void
	setBrackets: (path: string, brackets?: BracketInfo[]) => void
	setErrors: (path: string, errors?: TreeSitterError[]) => void
	setScrollPosition: (path: string, position?: ScrollPosition) => void
	setCursorPosition: (path: string, position?: CursorPosition) => void
	setSelections: (path: string, selections?: SelectionRange[]) => void
	setVisibleContent: (path: string, content?: VisibleContentSnapshot) => void
	setViewMode: (path: string, mode?: ViewMode) => void
	setDirtyPath: (path: string, isDirty?: boolean) => void
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
	setCursorPosition,
	setSelections,
	setVisibleContent,
	setViewMode,
	setDirtyPath,
}: FileCacheControllerOptions): FileCacheController => {
	const store = createFileStateStore({
		persistence: createIndexedDBBackend(),
		persistenceDebounceMs: 150,
	})
	const lsCache = createLocalStorageCache()
	const previews: Record<string, Uint8Array | undefined> = {}

	const toFilePath = (path: string): FilePath => createFilePath(path)

	const get = (path: string): FileCacheEntry => {
		if (DISABLE_CACHE) return {}
		const p = createFilePath(path)

		// Get view state from localStorage (sync)
		const lsState = lsCache.get(p)

		const result = {
			// Content state (from memory)
			pieceTable: state.pieceTables[p],
			stats: state.fileStats[p],
			previewBytes: previews[p],
			highlights: state.fileHighlights[p],
			folds: state.fileFolds[p],
			brackets: state.fileBrackets[p],
			errors: state.fileErrors[p],
			// View state (from memory, fallback to localStorage)
			scrollPosition: state.scrollPositions[p] ?? lsState?.scroll ?? undefined,
			cursorPosition: state.cursorPositions[p] ?? lsState?.cursor ?? undefined,
			selections: state.fileSelections[p] ?? lsState?.selections ?? undefined,
			visibleContent: state.visibleContents[p] ?? lsState?.visible ?? undefined,
			viewMode: state.fileViewModes[p] ?? lsState?.viewMode ?? undefined,
			isDirty: state.dirtyPaths[p] ?? lsState?.isDirty ?? undefined,
		}

		return result
	}

	const set = (path: string, entry: FileCacheEntry) => {
		if (!path || DISABLE_CACHE) return
		const p = createFilePath(path)

		// Update memory state
		batch(() => {
			// Content state
			if (entry.pieceTable !== undefined) setPieceTable(p, entry.pieceTable)
			if (entry.stats !== undefined) setFileStats(p, entry.stats)
			if (entry.highlights !== undefined) setHighlights(p, entry.highlights)
			if (entry.folds !== undefined) setFolds(p, entry.folds)
			if (entry.brackets !== undefined) setBrackets(p, entry.brackets)
			if (entry.errors !== undefined) setErrors(p, entry.errors)
			if (entry.previewBytes !== undefined) previews[p] = entry.previewBytes
			// View state
			if (entry.scrollPosition !== undefined) setScrollPosition(p, entry.scrollPosition)
			if (entry.cursorPosition !== undefined) setCursorPosition(p, entry.cursorPosition)
			if (entry.selections !== undefined) setSelections(p, entry.selections)
			if (entry.visibleContent !== undefined) setVisibleContent(p, entry.visibleContent)
			if (entry.viewMode !== undefined) setViewMode(p, entry.viewMode)
			if (entry.isDirty !== undefined) setDirtyPath(p, entry.isDirty)
		})

		// Write view state to localStorage (sync, debounced)
		const hasViewState =
			entry.scrollPosition !== undefined ||
			entry.cursorPosition !== undefined ||
			entry.selections !== undefined ||
			entry.visibleContent !== undefined ||
			entry.viewMode !== undefined ||
			entry.isDirty !== undefined

		if (hasViewState) {
			lsCache.set(p, {
				...(entry.scrollPosition !== undefined && { scroll: entry.scrollPosition }),
				...(entry.cursorPosition !== undefined && { cursor: entry.cursorPosition }),
				...(entry.selections !== undefined && { selections: entry.selections }),
				...(entry.visibleContent !== undefined && { visible: entry.visibleContent }),
				...(entry.viewMode !== undefined && { viewMode: entry.viewMode }),
				...(entry.isDirty !== undefined && { isDirty: entry.isDirty }),
			})
		}

		// Write content state to IndexedDB (async, debounced)
		const hasContentState =
			entry.pieceTable !== undefined ||
			entry.stats !== undefined ||
			entry.highlights !== undefined ||
			entry.folds !== undefined ||
			entry.brackets !== undefined ||
			entry.errors !== undefined ||
			entry.previewBytes !== undefined

		if (hasContentState) {
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
				...(entry.previewBytes !== undefined && {
					previewBytes: entry.previewBytes,
				}),
			})
		}
	}

	const clearBuffer = (path: string) => {
		if (!path) return
		const p = createFilePath(path)
		setPieceTable(p, undefined)
	}

	const clearContent = (path: string) => {
		if (!path) return
		const p = createFilePath(path)
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
		const p = createFilePath(path)
		batch(() => {
			// Content state
			setPieceTable(p, undefined)
			setFileStats(p, undefined)
			setHighlights(p, undefined)
			setFolds(p, undefined)
			setBrackets(p, undefined)
			setErrors(p, undefined)
			delete previews[p]
			// View state
			setScrollPosition(p, undefined)
			setCursorPosition(p, undefined)
			setSelections(p, undefined)
			setVisibleContent(p, undefined)
			setViewMode(p, undefined)
			setDirtyPath(p, undefined)
		})
		// Clear from localStorage
		lsCache.clear(p)
		// Clear from IndexedDB
		store.remove(toFilePath(p)).catch((error) => {
			console.warn(`FileCacheControllerV2: Failed to clear path ${p}:`, error)
		})
	}

	const clearAll = () => {
		batch(() => {
			// Content state
			for (const path of Object.keys(state.pieceTables)) setPieceTable(path, undefined)
			for (const path of Object.keys(state.fileStats)) setFileStats(path, undefined)
			for (const path of Object.keys(state.fileHighlights)) setHighlights(path, undefined)
			for (const path of Object.keys(state.fileFolds)) setFolds(path, undefined)
			for (const path of Object.keys(state.fileBrackets)) setBrackets(path, undefined)
			for (const path of Object.keys(state.fileErrors)) setErrors(path, undefined)
			for (const path of Object.keys(previews)) delete previews[path]
			// View state
			for (const path of Object.keys(state.scrollPositions)) setScrollPosition(path, undefined)
			for (const path of Object.keys(state.cursorPositions)) setCursorPosition(path, undefined)
			for (const path of Object.keys(state.fileSelections)) setSelections(path, undefined)
			for (const path of Object.keys(state.visibleContents)) setVisibleContent(path, undefined)
			for (const path of Object.keys(state.fileViewModes)) setViewMode(path, undefined)
			for (const path of Object.keys(state.dirtyPaths)) setDirtyPath(path, undefined)
		})
		// Clear localStorage
		lsCache.clearAll()
		// Clear IndexedDB
		store.clear().catch((error) => {
			console.warn('FileCacheControllerV2: Failed to clear all:', error)
		})
	}

	const clearMemory = () => {
		batch(() => {
			// Content state
			for (const path of Object.keys(state.pieceTables)) setPieceTable(path, undefined)
			for (const path of Object.keys(state.fileStats)) setFileStats(path, undefined)
			for (const path of Object.keys(state.fileHighlights)) setHighlights(path, undefined)
			for (const path of Object.keys(state.fileFolds)) setFolds(path, undefined)
			for (const path of Object.keys(state.fileBrackets)) setBrackets(path, undefined)
			for (const path of Object.keys(state.fileErrors)) setErrors(path, undefined)
			for (const path of Object.keys(previews)) delete previews[path]
			// View state
			for (const path of Object.keys(state.scrollPositions)) setScrollPosition(path, undefined)
			for (const path of Object.keys(state.cursorPositions)) setCursorPosition(path, undefined)
			for (const path of Object.keys(state.fileSelections)) setSelections(path, undefined)
			for (const path of Object.keys(state.visibleContents)) setVisibleContent(path, undefined)
			for (const path of Object.keys(state.fileViewModes)) setViewMode(path, undefined)
			for (const path of Object.keys(state.dirtyPaths)) setDirtyPath(path, undefined)
		})
	}

	const getAsync = async (path: string): Promise<FileCacheEntry> => {
		if (DISABLE_CACHE) return {}
		const p = createFilePath(path)

		// Step 1: Get from memory + localStorage (sync) - includes view state
		const memoryEntry = get(p)
		const hasContentInMemory =
			memoryEntry.pieceTable !== undefined ||
			memoryEntry.stats !== undefined ||
			memoryEntry.highlights !== undefined

		// If we have content in memory, return immediately
		if (hasContentInMemory) return memoryEntry

		// Step 2: Get content state from IndexedDB (async)
		const fp = toFilePath(p)
		const persistedState = await store.getAsync(fp)

		// Build entry from IndexedDB content + existing view state
		const entry: FileCacheEntry = {
			// Content state from IndexedDB
			pieceTable: persistedState?.pieceTable?.value,
			stats: persistedState?.stats?.value,
			previewBytes: persistedState?.previewBytes ?? undefined,
			highlights: persistedState?.syntax?.value.highlights,
			folds: persistedState?.syntax?.value.folds,
			brackets: persistedState?.syntax?.value.brackets,
			errors: persistedState?.syntax?.value.errors,
			lineStarts: persistedState?.lineStarts ?? undefined,
			// View state from memory/localStorage (already in memoryEntry)
			scrollPosition: memoryEntry.scrollPosition,
			cursorPosition: memoryEntry.cursorPosition,
			selections: memoryEntry.selections,
			visibleContent: memoryEntry.visibleContent,
			viewMode: memoryEntry.viewMode,
			isDirty: memoryEntry.isDirty,
		}

		// Populate memory with content state from IndexedDB
		batch(() => {
			if (entry.pieceTable) setPieceTable(p, entry.pieceTable)
			if (entry.stats) setFileStats(p, entry.stats)
			if (entry.highlights) setHighlights(p, entry.highlights)
			if (entry.folds) setFolds(p, entry.folds)
			if (entry.brackets) setBrackets(p, entry.brackets)
			if (entry.errors) setErrors(p, entry.errors)
			if (entry.previewBytes) previews[p] = entry.previewBytes
			// Also populate view state in memory from localStorage
			if (entry.scrollPosition) setScrollPosition(p, entry.scrollPosition)
			if (entry.cursorPosition) setCursorPosition(p, entry.cursorPosition)
			if (entry.selections) setSelections(p, entry.selections)
			if (entry.visibleContent) setVisibleContent(p, entry.visibleContent)
			if (entry.viewMode) setViewMode(p, entry.viewMode)
			if (entry.isDirty !== undefined) setDirtyPath(p, entry.isDirty)
		})

		return entry
	}

	const getScrollPosition = (path: string): ScrollPosition | undefined => {
		const p = createFilePath(path)
		// Check memory first, then localStorage
		const memoryScroll = state.scrollPositions[p]
		if (memoryScroll) return memoryScroll
		const lsState = lsCache.get(p)
		return lsState?.scroll ?? undefined
	}

	const getLineStarts = (path: string): number[] | undefined => {
		const p = createFilePath(path)
		return state.fileStats[p]?.lineStarts
	}

	const setActiveFile = (_path: string | null): void => {}
	const setOpenTabs = (_paths: string[]): void => {}

	const getStats = async (): Promise<CacheStats> => {
		const lsStats = lsCache.getStats()
		return {
			memoryEntries: store.size,
			persistedEntries: lsStats.entries,
			totalSize: lsStats.approximateSize,
		}
	}

	const flush = async (): Promise<void> => {
		// Flush localStorage (sync)
		lsCache.flush()
		// Flush IndexedDB (async)
		await store.flush()
	}

	// === ReactiveFileState management ===
	// Simple Map since ReactiveFileState is now a thin accessor (no reactive primitives)
	const fileStates = new Map<FilePath, ReactiveFileState>()

	/**
	 * Get or create a ReactiveFileState for a path.
	 * This is a thin accessor layer over the existing state stores.
	 */
	const getFileState = (path: string): ReactiveFileState => {
		const p = createFilePath(path)
		let fileState = fileStates.get(p)

		if (!fileState) {
			fileState = createReactiveFileState({
				path: p,
				stores: {
					pieceTables: state.pieceTables,
					fileStats: state.fileStats,
					fileHighlights: state.fileHighlights,
					fileFolds: state.fileFolds,
					fileBrackets: state.fileBrackets,
					fileErrors: state.fileErrors,
					scrollPositions: state.scrollPositions,
					cursorPositions: state.cursorPositions,
					fileSelections: state.fileSelections,
					visibleContents: state.visibleContents,
					fileViewModes: state.fileViewModes,
					dirtyPaths: state.dirtyPaths,
				},
				setters: {
					setPieceTable,
					setFileStats,
					setHighlights,
					setFolds,
					setBrackets,
					setErrors,
					setScrollPosition,
					setCursorPosition,
					setSelections,
					setVisibleContent,
					setViewMode,
					setDirtyPath,
					setPreviewBytes: (path, value) => {
						if (value) {
							previews[path] = value
						} else {
							delete previews[path]
						}
					},
				},
				getPreviewBytes: () => previews[p],
			})

			fileStates.set(p, fileState)
		}

		return fileState
	}

	const hasFileState = (path: string): boolean => {
		const p = createFilePath(path)
		return fileStates.has(p)
	}

	const removeFileState = (path: string): void => {
		const p = createFilePath(path)
		fileStates.delete(p)
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
		getFileState,
		hasFileState,
		removeFileState,
	}
}
