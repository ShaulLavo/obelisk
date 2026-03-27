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
	private initPromise: Promise<void> | null = null

	async init(): Promise<void> {
		if (!this.initPromise) {
			this.initPromise = initSqlite().then(() => {})
		}
		await this.initPromise
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initPromise) {
			await this.initPromise
		}
	}

	async search(query: string): Promise<SearchResult[]> {
		await this.ensureInitialized()
		return searchFiles(query)
	}

	async indexFiles(files: FileMetadata[]): Promise<void> {
		await this.ensureInitialized()
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
