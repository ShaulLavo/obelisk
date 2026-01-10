import { batch } from 'solid-js'
import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type { VisibleContentSnapshot } from '@repo/code-editor'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'
import type { FsState } from '../types'
import {
	TieredCacheController,
	type TieredCacheControllerOptions,
} from './tieredCacheController'
import type { CacheStats } from './backends/types'

export const DISABLE_CACHE = false as const

/**
 * Normalize path by stripping leading slash.
 * This ensures consistent cache keys regardless of path format.
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export type ScrollPosition = {
	lineIndex: number
	scrollLeft: number
}

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
	setActiveFile: (path: string | null) => void
	setOpenTabs: (paths: string[]) => void
	getStats: () => Promise<CacheStats>
	flush: () => Promise<void>
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
	tieredCacheOptions?: TieredCacheControllerOptions
}

export const createFileCacheController = ({
	state,
	setPieceTable,
	setFileStats,
	setHighlights,
	setFolds,
	setBrackets,
	setErrors,
	setScrollPosition,
	setVisibleContent,
	tieredCacheOptions,
}: FileCacheControllerOptions): FileCacheController => {
	const previews: Record<string, Uint8Array | undefined> = {}
	const tieredCache = new TieredCacheController(tieredCacheOptions)

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
			if (entry.pieceTable !== undefined) {
				setPieceTable(p, entry.pieceTable)
			}
			if (entry.stats !== undefined) {
				setFileStats(p, entry.stats)
			}
			if (entry.highlights !== undefined) {
				setHighlights(p, entry.highlights)
			}
			if (entry.folds !== undefined) {
				setFolds(p, entry.folds)
			}
			if (entry.previewBytes !== undefined) {
				previews[p] = entry.previewBytes
			}
			if (entry.brackets !== undefined) {
				setBrackets(p, entry.brackets)
			}
			if (entry.errors !== undefined) {
				setErrors(p, entry.errors)
			}
			if (entry.scrollPosition !== undefined) {
				setScrollPosition(p, entry.scrollPosition)
			}
			if (entry.visibleContent !== undefined) {
				setVisibleContent(p, entry.visibleContent)
			}
		})
		tieredCache.set(p, entry).catch((error) => {
			console.warn(
				`FileCacheController: Failed to persist entry for ${p}:`,
				error
			)
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
		tieredCache.clearPath(p).catch((error) => {
			console.warn(`FileCacheController: Failed to clear path ${p}:`, error)
		})
	}

	const clearAll = () => {
		batch(() => {
			for (const path of Object.keys(state.pieceTables)) {
				setPieceTable(path, undefined)
			}
			for (const path of Object.keys(state.fileStats)) {
				setFileStats(path, undefined)
			}
			for (const path of Object.keys(state.fileHighlights)) {
				setHighlights(path, undefined)
			}
			for (const path of Object.keys(state.fileFolds)) {
				setFolds(path, undefined)
			}
			for (const path of Object.keys(state.fileBrackets)) {
				setBrackets(path, undefined)
			}
			for (const path of Object.keys(state.fileErrors)) {
				setErrors(path, undefined)
			}
			for (const path of Object.keys(state.scrollPositions)) {
				setScrollPosition(path, undefined)
			}
			for (const path of Object.keys(state.visibleContents)) {
				setVisibleContent(path, undefined)
			}
			for (const path of Object.keys(previews)) {
				delete previews[path]
			}
		})
		tieredCache.clearAll().catch((error) => {
			console.warn('FileCacheController: Failed to clear all:', error)
		})
	}

	const clearMemory = () => {
		batch(() => {
			for (const path of Object.keys(state.pieceTables)) {
				setPieceTable(path, undefined)
			}
			for (const path of Object.keys(state.fileStats)) {
				setFileStats(path, undefined)
			}
			for (const path of Object.keys(state.fileHighlights)) {
				setHighlights(path, undefined)
			}
			for (const path of Object.keys(state.fileFolds)) {
				setFolds(path, undefined)
			}
			for (const path of Object.keys(state.fileBrackets)) {
				setBrackets(path, undefined)
			}
			for (const path of Object.keys(state.fileErrors)) {
				setErrors(path, undefined)
			}
			for (const path of Object.keys(state.scrollPositions)) {
				setScrollPosition(path, undefined)
			}
			for (const path of Object.keys(state.visibleContents)) {
				setVisibleContent(path, undefined)
			}
			for (const path of Object.keys(previews)) {
				delete previews[path]
			}
		})
	}

	const getAsync = async (path: string): Promise<FileCacheEntry> => {
		if (DISABLE_CACHE) return {}
		const p = normalizePath(path)
		const memoryEntry = get(p)
		const hasMemoryData = Object.keys(memoryEntry).some(
			(key) => memoryEntry[key as keyof FileCacheEntry] !== undefined
		)
		if (hasMemoryData) {
			return memoryEntry
		}
		const persistedEntry = await tieredCache.getAsync(p)
		if (Object.keys(persistedEntry).length > 0) {
			batch(() => {
				if (persistedEntry.pieceTable !== undefined) {
					setPieceTable(p, persistedEntry.pieceTable)
				}
				if (persistedEntry.stats !== undefined) {
					setFileStats(p, persistedEntry.stats)
				}
				if (persistedEntry.highlights !== undefined) {
					setHighlights(p, persistedEntry.highlights)
				}
				if (persistedEntry.folds !== undefined) {
					setFolds(p, persistedEntry.folds)
				}
				if (persistedEntry.previewBytes !== undefined) {
					previews[p] = persistedEntry.previewBytes
				}
				if (persistedEntry.brackets !== undefined) {
					setBrackets(p, persistedEntry.brackets)
				}
				if (persistedEntry.errors !== undefined) {
					setErrors(p, persistedEntry.errors)
				}
				if (persistedEntry.scrollPosition !== undefined) {
					setScrollPosition(p, persistedEntry.scrollPosition)
				}
				if (persistedEntry.visibleContent !== undefined) {
					setVisibleContent(p, persistedEntry.visibleContent)
				}
			})
		}
		return persistedEntry
	}

	const setActiveFile = (path: string | null): void => {
		tieredCache.setActiveFile(path ? normalizePath(path) : null)
	}

	const setOpenTabs = (paths: string[]): void => {
		tieredCache.setOpenTabs(paths.map(normalizePath))
	}

	const getScrollPosition = (path: string): ScrollPosition | undefined => {
		const p = normalizePath(path)
		const memoryPos = state.scrollPositions[p]
		if (memoryPos) return memoryPos
		return tieredCache.getScrollPosition(p)
	}

	const getStats = async (): Promise<CacheStats> => {
		return tieredCache.getStats()
	}

	const flush = async (): Promise<void> => {
		return tieredCache.flush()
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
		setActiveFile,
		setOpenTabs,
		getStats,
		flush,
	}
}
