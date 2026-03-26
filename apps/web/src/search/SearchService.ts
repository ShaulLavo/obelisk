import {
	searchFiles,
	batchInsertFiles,
	resetSqlite,
	initSqlite,
	removeFromIndex,
	renameInIndex,
} from '../workers/sqliteClient'
import type { SearchResult, FileMetadata } from './types'

export class SearchService {
	async init(): Promise<void> {
		const result = await initSqlite()
		if (!result.opfsEnabled) {
			console.warn('[SearchService] SQLite running in memory mode - search index will not persist')
		}
	}

	search(query: string): Promise<SearchResult[]> {
		return searchFiles(query)
	}

	indexFiles(files: FileMetadata[]): Promise<void> {
		return batchInsertFiles(files)
	}

	reset(): Promise<void> {
		return resetSqlite()
	}

	/**
	 * Remove a file or directory from the search index.
	 * Call this when a file/directory is deleted.
	 */
	removeFile(
		path: string,
		options?: { recursive?: boolean }
	): Promise<number> {
		return removeFromIndex(path, options)
	}

	/**
	 * Rename/move a file or directory in the search index.
	 * Call this when a file/directory is renamed or moved.
	 */
	renameFile(
		oldPath: string,
		newPath: string,
		options?: { recursive?: boolean }
	): Promise<number> {
		return renameInIndex(oldPath, newPath, options)
	}
}

export const searchService = new SearchService()
