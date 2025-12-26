/**
 * Grep Coordinator
 *
 * Main thread orchestrator that:
 * 1. Enumerates files using VFS (benefits from directory cache)
 * 2. Dispatches file batches to worker pool
 * 3. Aggregates and streams results back
 */

import { wrap, type Remote } from 'comlink'
import type { FsContext } from '../vfs/types'
import type {
	GrepOptions,
	GrepMatch,
	GrepFileTask,
	GrepFileResult,
	GrepProgressCallback,
} from './types'
import type { GrepWorkerApi } from './grepWorker'
import { DEFAULT_CHUNK_SIZE } from './chunkReader'

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_WORKER_COUNT = Math.min(
	typeof navigator !== 'undefined' ? navigator.hardwareConcurrency - 1 : 4,
	6
)
const BATCH_SIZE = 10 // Files per worker dispatch
const textEncoder = new TextEncoder()

// ============================================================================
// Coordinator
// ============================================================================

export class GrepCoordinator {
	readonly #fs: FsContext
	#workerPool: Remote<GrepWorkerApi>[] = []
	#terminated = false

	constructor(fs: FsContext) {
		this.#fs = fs
	}

	/**
	 * Search for a pattern across files.
	 *
	 * @param options - Search configuration
	 * @param onProgress - Optional progress callback
	 * @returns Array of all matches found
	 */
	async grep(
		options: GrepOptions,
		onProgress?: GrepProgressCallback
	): Promise<GrepMatch[]> {
		if (this.#terminated) {
			throw new Error('GrepCoordinator has been terminated')
		}

		const workerCount = options.workerCount ?? DEFAULT_WORKER_COUNT
		await this.#ensureWorkerPool(workerCount)

		// 1. Enumerate files using VFS (benefits from directory handle cache!)
		const filePaths = await this.#enumerateFilePaths(options)

		if (filePaths.length === 0) {
			return []
		}

		const patternBytes = textEncoder.encode(options.pattern)
		const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE

		// 2. Get file handles and create tasks
		const tasks: GrepFileTask[] = []
		for (const path of filePaths) {
			try {
				const handle = await this.#fs.getFileHandleForRelative(path, false)
				tasks.push({
					fileHandle: handle,
					path,
					patternBytes,
					chunkSize,
				})
			} catch {
				// Skip files we can't get handles for
			}
		}

		// 3. Dispatch batches to worker pool
		const allMatches: GrepMatch[] = []
		let filesScanned = 0

		const batches = this.#chunk(tasks, BATCH_SIZE)

		// Process batches in parallel across workers
		const batchPromises = batches.map((batch, batchIndex) => {
			const workerIndex = batchIndex % this.#workerPool.length
			const worker = this.#workerPool[workerIndex]!

			return worker.grepBatch(batch).then((results: GrepFileResult[]) => {
				for (const result of results) {
					// Skip binary files or errors
					if (!result.error) {
						allMatches.push(...result.matches)
					}

					filesScanned++
					onProgress?.({
						filesScanned,
						filesTotal: tasks.length,
						matchesFound: allMatches.length,
						currentFile: result.path,
					})

					// Check maxResults limit
					if (
						options.maxResults !== undefined &&
						allMatches.length >= options.maxResults
					) {
						// Could implement early termination here
					}
				}
			})
		})

		await Promise.all(batchPromises)

		// Apply maxResults limit if specified
		if (options.maxResults !== undefined) {
			return allMatches.slice(0, options.maxResults)
		}

		return allMatches
	}

	/**
	 * Search for pattern and yield results as they're found.
	 * Use for streaming results to UI.
	 */
	async *grepStream(
		options: GrepOptions
	): AsyncGenerator<GrepFileResult, void, unknown> {
		if (this.#terminated) {
			throw new Error('GrepCoordinator has been terminated')
		}

		const workerCount = options.workerCount ?? DEFAULT_WORKER_COUNT
		await this.#ensureWorkerPool(workerCount)

		const filePaths = await this.#enumerateFilePaths(options)
		if (filePaths.length === 0) return

		const patternBytes = textEncoder.encode(options.pattern)
		const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE

		// Process files one at a time for streaming
		for (const path of filePaths) {
			try {
				const handle = await this.#fs.getFileHandleForRelative(path, false)
				const task: GrepFileTask = {
					fileHandle: handle,
					path,
					patternBytes,
					chunkSize,
				}

				// Use first available worker
				const worker = this.#workerPool[0]!
				const result = await worker.grepFile(task)

				if (!result.error && result.matches.length > 0) {
					yield result
				}
			} catch {
				// Skip files we can't access
			}
		}
	}

	/**
	 * Enumerate file paths to search using VFS.
	 * Leverages the VFS directory handle cache for performance.
	 */
	async #enumerateFilePaths(options: GrepOptions): Promise<string[]> {
		const filePaths: string[] = []
		const searchPaths = options.paths ?? ['']

		for (const searchPath of searchPaths) {
			const rootDir = this.#fs.dir(searchPath)

			try {
				// Use VFS tree walker
				for await (const entry of rootDir.walk({
					includeFiles: true,
					includeDirs: false,
					filter: (entry) => {
						// Skip hidden files/dirs
						if (!options.includeHidden && entry.name.startsWith('.')) {
							return false
						}
						// TODO: Apply excludePatterns
						return true
					},
				})) {
					if (entry.kind === 'file') {
						filePaths.push(entry.path)
					}
				}
			} catch (error) {
				console.warn(`Failed to enumerate path: ${searchPath}`, error)
			}
		}

		return filePaths
	}

	/**
	 * Initialize worker pool with specified count.
	 */
	async #ensureWorkerPool(count: number): Promise<void> {
		const needed = count - this.#workerPool.length

		for (let i = 0; i < needed; i++) {
			const worker = new Worker(new URL('./grepWorker.ts', import.meta.url), {
				type: 'module',
			})
			this.#workerPool.push(wrap<GrepWorkerApi>(worker))
		}
	}

	/**
	 * Split array into chunks of specified size.
	 */
	#chunk<T>(arr: T[], size: number): T[][] {
		const chunks: T[][] = []
		for (let i = 0; i < arr.length; i += size) {
			chunks.push(arr.slice(i, i + size))
		}
		return chunks
	}

	/**
	 * Terminate all workers and cleanup resources.
	 */
	terminate(): void {
		this.#terminated = true
		// Note: Comlink doesn't expose underlying worker, would need to track it
		this.#workerPool = []
	}

	/**
	 * Get current worker pool size.
	 */
	get workerCount(): number {
		return this.#workerPool.length
	}
}
