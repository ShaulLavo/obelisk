import { batch } from 'solid-js'
import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type { TreeSitterCapture, BracketInfo, TreeSitterError, FoldRange } from '../../workers/treeSitterWorkerTypes'
import type { FsState } from '../types'

export type FileCacheEntry = {
	pieceTable?: PieceTableSnapshot
	stats?: ParseResult
	previewBytes?: Uint8Array
	highlights?: TreeSitterCapture[]
	folds?: FoldRange[]
	brackets?: BracketInfo[]
	errors?: TreeSitterError[]
}

export type FileCacheController = {
	get: (path: string) => FileCacheEntry
	set: (path: string, entry: FileCacheEntry) => void
	clearPath: (path: string) => void
	clearAll: () => void
}

type FileCacheControllerOptions = {
	state: Pick<FsState, 'pieceTables' | 'fileStats' | 'fileHighlights' | 'fileFolds' | 'fileBrackets' | 'fileErrors'>
	setPieceTable: (path: string, snapshot?: PieceTableSnapshot) => void
	setFileStats: (path: string, stats?: ParseResult) => void
	setHighlights: (path: string, highlights?: TreeSitterCapture[]) => void
	setFolds: (path: string, folds?: FoldRange[]) => void
	setBrackets: (path: string, brackets?: BracketInfo[]) => void
	setErrors: (path: string, errors?: TreeSitterError[]) => void
}

export const createFileCacheController = ({
	state,
	setPieceTable,
	setFileStats,
	setHighlights,
	setFolds,
	setBrackets,
	setErrors
}: FileCacheControllerOptions): FileCacheController => {
	// TODO: add eviction and persistence so all artifacts are released together.
	const previews: Record<string, Uint8Array | undefined> = {}

	const get = (path: string): FileCacheEntry => {
		return {
			pieceTable: state.pieceTables[path],
			stats: state.fileStats[path],
			previewBytes: previews[path],
			highlights: state.fileHighlights[path],
			folds: state.fileFolds[path],
			brackets: state.fileBrackets[path],
			errors: state.fileErrors[path]
		}
	}

	const set = (path: string, entry: FileCacheEntry) => {
		if (!path) return
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
		})
	}


	const clearPath = (path: string) => {
		if (!path) return
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
			for (const path of Object.keys(previews)) {
				delete previews[path]
			}
		})
	}

	return {
		get,
		set,
		clearPath,
		clearAll
	}
}
