import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type { FsState } from '../types'

export type FileCacheEntry = {
	pieceTable?: PieceTableSnapshot
	stats?: ParseResult
	previewBytes?: Uint8Array
}

export type FileCacheController = {
	get: (path: string) => FileCacheEntry
	set: (path: string, entry: FileCacheEntry) => void
	clearPath: (path: string) => void
	clearAll: () => void
}

type FileCacheControllerOptions = {
	state: Pick<FsState, 'pieceTables' | 'fileStats'>
	setPieceTable: (path: string, snapshot?: PieceTableSnapshot) => void
	setFileStats: (path: string, stats?: ParseResult) => void
}

export const createFileCacheController = ({
	state,
	setPieceTable,
	setFileStats
}: FileCacheControllerOptions): FileCacheController => {
	// TODO: add eviction and persistence so all artifacts are released together.
	const previews: Record<string, Uint8Array | undefined> = {}

	const get = (path: string): FileCacheEntry => {
		return {
			pieceTable: state.pieceTables[path],
			stats: state.fileStats[path],
			previewBytes: previews[path]
		}
	}

	const set = (path: string, entry: FileCacheEntry) => {
		if (!path) return
		if (entry.pieceTable !== undefined) {
			setPieceTable(path, entry.pieceTable)
		}
		if (entry.stats !== undefined) {
			setFileStats(path, entry.stats)
		}
		if (entry.previewBytes !== undefined) {
			previews[path] = entry.previewBytes
		}
	}

	const clearPath = (path: string) => {
		if (!path) return
		setPieceTable(path, undefined)
		setFileStats(path, undefined)
		delete previews[path]
	}

	const clearAll = () => {
		for (const path of Object.keys(state.pieceTables)) {
			setPieceTable(path, undefined)
		}
		for (const path of Object.keys(state.fileStats)) {
			setFileStats(path, undefined)
		}
		for (const path of Object.keys(previews)) {
			delete previews[path]
		}
	}

	return {
		get,
		set,
		clearPath,
		clearAll
	}
}

