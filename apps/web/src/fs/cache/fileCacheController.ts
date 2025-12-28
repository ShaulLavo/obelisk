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
		return {
			pieceTable: state.pieceTables[path],
			stats: state.fileStats[path],
			previewBytes: previews[path],
			highlights: state.fileHighlights[path],
			folds: state.fileFolds[path],
			brackets: state.fileBrackets[path],
			errors: state.fileErrors[path],
			scrollPosition: state.scrollPositions[path],
			visibleContent: state.visibleContents[path],
		}
	}

	const set = (path: string, entry: FileCacheEntry) => {
		if (!path || DISABLE_CACHE) return
		batch(() => {
			if (entry.pieceTable !== undefined) {
				setPieceTable(path, entry.pieceTable)
			}
			if (entry.stats !== undefined) {
				setFileStats(path, entry.stats)
			}
			if (entry.highlights !== undefined) {
				setHighlights(path, entry.highlights)
			}
			if (entry.folds !== undefined) {
				setFolds(path, entry.folds)
			}
			if (entry.previewBytes !== undefined) {
				previews[path] = entry.previewBytes
			}
			if (entry.brackets !== undefined) {
				setBrackets(path, entry.brackets)
			}
			if (entry.errors !== undefined) {
				setErrors(path, entry.errors)
			}
			if (entry.scrollPosition !== undefined) {
				setScrollPosition(path, entry.scrollPosition)
			}
			if (entry.visibleContent !== undefined) {
				setVisibleContent(path, entry.visibleContent)
			}
		})
		tieredCache.set(path, entry).catch((error) => {
			console.warn(
				`FileCacheController: Failed to persist entry for ${path}:`,
				error
			)
		})
	}

	const clearBuffer = (path: string) => {
		if (!path) return
		setPieceTable(path, undefined)
	}

	const clearContent = (path: string) => {
		if (!path) return
		console.debug(`[FileCacheController] clearContent called for ${path}`)
		batch(() => {
			setPieceTable(path, undefined)
			setFileStats(path, undefined)
			setHighlights(path, undefined)
			setFolds(path, undefined)
			setBrackets(path, undefined)
			setErrors(path, undefined)
			delete previews[path]
		})
	}

	const clearPath = (path: string) => {
		if (!path) return
		console.debug(`[FileCacheController] clearPath called for ${path}`)
		batch(() => {
			setPieceTable(path, undefined)
			setFileStats(path, undefined)
			setHighlights(path, undefined)
			setFolds(path, undefined)
			setBrackets(path, undefined)
			setErrors(path, undefined)
			setScrollPosition(path, undefined)
			setVisibleContent(path, undefined)
			delete previews[path]
		})
		tieredCache.clearPath(path).catch((error) => {
			console.warn(`FileCacheController: Failed to clear path ${path}:`, error)
		})
	}

	const clearAll = () => {
		console.debug('[FileCacheController] clearAll called')
		console.trace()
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
		console.debug('[FileCacheController] clearMemory called')
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
		const memoryEntry = get(path)
		const hasMemoryData = Object.keys(memoryEntry).some(
			(key) => memoryEntry[key as keyof FileCacheEntry] !== undefined
		)
		if (hasMemoryData) {
			return memoryEntry
		}
		const persistedEntry = await tieredCache.getAsync(path)
		if (Object.keys(persistedEntry).length > 0) {
			batch(() => {
				if (persistedEntry.pieceTable !== undefined) {
					setPieceTable(path, persistedEntry.pieceTable)
				}
				if (persistedEntry.stats !== undefined) {
					setFileStats(path, persistedEntry.stats)
				}
				if (persistedEntry.highlights !== undefined) {
					setHighlights(path, persistedEntry.highlights)
				}
				if (persistedEntry.folds !== undefined) {
					setFolds(path, persistedEntry.folds)
				}
				if (persistedEntry.previewBytes !== undefined) {
					previews[path] = persistedEntry.previewBytes
				}
				if (persistedEntry.brackets !== undefined) {
					setBrackets(path, persistedEntry.brackets)
				}
				if (persistedEntry.errors !== undefined) {
					setErrors(path, persistedEntry.errors)
				}
				if (persistedEntry.scrollPosition !== undefined) {
					setScrollPosition(path, persistedEntry.scrollPosition)
				}
				if (persistedEntry.visibleContent !== undefined) {
					setVisibleContent(path, persistedEntry.visibleContent)
				}
			})
		}
		return persistedEntry
	}

	const setActiveFile = (path: string | null): void => {
		tieredCache.setActiveFile(path)
	}

	const setOpenTabs = (paths: string[]): void => {
		tieredCache.setOpenTabs(paths)
	}

	const getScrollPosition = (path: string): ScrollPosition | undefined => {
		const memoryPos = state.scrollPositions[path]
		if (memoryPos) return memoryPos
		return tieredCache.getScrollPosition(path)
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
