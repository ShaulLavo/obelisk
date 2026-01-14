/**
 * Grep Coordinator
 *
 * Main thread orchestrator that:
 * 1. Streams files to workers as they're discovered (no upfront enumeration)
 * 2. Dispatches file tasks to worker pool in parallel
 * 3. Aggregates and streams results back
 *
 * Key optimization: Files are dispatched to workers immediately as they're
 * found during directory traversal, rather than waiting for full enumeration.
 */

import { wrap, type Remote } from 'comlink'
import type { RootCtx } from '../file'
import type {
	GrepOptions,
	GrepMatch,
	GrepFileTask,
	GrepFileResult,
	GrepProgressCallback,
} from './types'
import type { GrepWorkerApi } from './grepWorker'
import { DEFAULT_CHUNK_SIZE } from './chunkReader'

const FILE_TYPES: Record<string, string[]> = {
	ts: ['*.ts', '*.tsx'],
	js: ['*.js', '*.jsx', '*.mjs', '*.cjs'],
	css: ['*.css', '*.scss', '*.less'],
	json: ['*.json'],
	html: ['*.html'],
	md: ['*.md', '*.markdown'],
	txt: ['*.txt'],
}

const concurrency =
	typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4
const DEFAULT_WORKER_COUNT = Math.min(concurrency - 1 || 3, 6)
const MAX_CONCURRENT_TASKS = 24
const textEncoder = new TextEncoder()

export class GrepCoordinator {
	readonly #fs: RootCtx
	#workerPool: { worker: Worker; proxy: Remote<GrepWorkerApi> }[] = []
	#terminated = false

	constructor(fs: RootCtx) {
		this.#fs = fs
	}

	/**
	 * Search for a pattern across files.
	 * Files are dispatched to workers as they're discovered during traversal.
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

		const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
		const searchPaths = options.paths ?? ['']
		const effectiveOptions = this.#resolveOptions(options)
		const patternBytes = textEncoder.encode(options.pattern)

		const allMatches: GrepMatch[] = []
		let filesFound = 0
		let filesScanned = 0
		let matchesFoundTotal = 0
		let reachedLimit = false
		let nextWorkerIndex = 0

		let activeTasks = 0
		const taskQueue: (() => void)[] = []

		const acquireSlot = (): Promise<void> => {
			if (activeTasks < MAX_CONCURRENT_TASKS) {
				activeTasks++
				return Promise.resolve()
			}
			return new Promise((resolve) => {
				taskQueue.push(() => {
					activeTasks++
					resolve()
				})
			})
		}

		const releaseSlot = (): void => {
			activeTasks--
			const next = taskQueue.shift()
			if (next) next()
		}

		const pendingTasks: Promise<void>[] = []

		const processFile = async (path: string): Promise<void> => {
			if (reachedLimit) return

			await acquireSlot()

			try {
				const handle = await this.#fs.getFileHandleForRelative(path, false)
				const task: GrepFileTask = {
					fileHandle: handle,
					path,
					patternBytes,
					chunkSize,
					options: effectiveOptions,
				}

				const workerIndex = nextWorkerIndex
				nextWorkerIndex = (nextWorkerIndex + 1) % this.#workerPool.length
				const worker = this.#workerPool[workerIndex]!.proxy

				const result = await worker.grepFile(task)

				if (!result.error) {
					if (options.filesWithMatches) {
						if (result.matchCount && result.matchCount > 0) {
							allMatches.push({
								path,
								lineNumber: 0,
								lineContent: '',
								matchStart: 0,
							})
						}
					} else if (options.filesWithoutMatch) {
						if (!result.matchCount || result.matchCount === 0) {
							allMatches.push({
								path,
								lineNumber: 0,
								lineContent: '',
								matchStart: 0,
							})
						}
					} else {
						allMatches.push(...result.matches)
					}

					matchesFoundTotal += result.matchCount ?? result.matches.length
				}

				filesScanned++
				onProgress?.({
					filesScanned,
					filesTotal: filesFound,
					matchesFound: matchesFoundTotal,
					currentFile: result.path,
				})

				if (
					options.maxResults !== undefined &&
					allMatches.length >= options.maxResults
				) {
					reachedLimit = true
				}
			} catch {
				filesScanned++
			} finally {
				releaseSlot()
			}
		}

		for (const searchPath of searchPaths) {
			if (reachedLimit) break

			try {
				if (searchPath && searchPath !== '.' && searchPath !== '/') {
					await this.#fs.getFileHandleForRelative(searchPath, false)
					filesFound++
					const task = processFile(searchPath)
					pendingTasks.push(task)
					continue
				}
			} catch {
				// Not a file, proceed to directory walk
			}

			const rootDir = this.#fs.dir(searchPath)

			try {
				for await (const entry of rootDir.walk({
					includeFiles: true,
					includeDirs: true,
					filter: (entry) => this.#shouldIncludeEntry(entry, options),
				})) {
					if (reachedLimit) break

					if (entry.kind === 'file') {
						filesFound++
						const task = processFile(entry.path)
						pendingTasks.push(task)
					}
				}
			} catch {}
		}

		await Promise.all(pendingTasks)

		onProgress?.({
			filesScanned,
			filesTotal: filesFound,
			matchesFound: matchesFoundTotal,
			currentFile: '',
		})

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

		const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
		const searchPaths = options.paths ?? ['']
		const effectiveOptions = this.#resolveOptions(options)
		const patternBytes = textEncoder.encode(options.pattern)

		for (const searchPath of searchPaths) {
			try {
				if (searchPath && searchPath !== '.' && searchPath !== '/') {
					const handle = await this.#fs.getFileHandleForRelative(
						searchPath,
						false
					)

					const task: GrepFileTask = {
						fileHandle: handle,
						path: searchPath,
						patternBytes,
						chunkSize,
						options: effectiveOptions,
					}

					const worker = this.#workerPool[0]!.proxy
					const result = await worker.grepFile(task)

					if (!result.error) {
						if (options.filesWithMatches) {
							if (result.matchCount && result.matchCount > 0) {
								yield { ...result, matches: [] }
							}
						} else if (options.filesWithoutMatch) {
							if (!result.matchCount || result.matchCount === 0) {
								yield { ...result, matches: [] }
							}
						} else if (
							result.matches.length > 0 ||
							(options.count && result.matchCount)
						) {
							yield result
						}
					}
					continue
				}
			} catch {
				// Not a file, proceed to directory walk
			}

			const rootDir = this.#fs.dir(searchPath)

			try {
				for await (const entry of rootDir.walk({
					includeFiles: true,
					includeDirs: true,
					filter: (entry) => this.#shouldIncludeEntry(entry, options),
				})) {
					if (entry.kind === 'file') {
						try {
							const handle = await this.#fs.getFileHandleForRelative(
								entry.path,
								false
							)
							const task: GrepFileTask = {
								fileHandle: handle,
								path: entry.path,
								patternBytes,
								chunkSize,
								options: effectiveOptions,
							}

							const worker = this.#workerPool[0]!.proxy
							const result = await worker.grepFile(task)

							if (!result.error) {
								if (options.filesWithMatches) {
									if (result.matchCount && result.matchCount > 0) {
										yield { ...result, matches: [] } // Empty matches, just path matters
									}
								} else if (options.filesWithoutMatch) {
									if (!result.matchCount || result.matchCount === 0) {
										yield { ...result, matches: [] }
									}
								} else if (
									result.matches.length > 0 ||
									(options.count && result.matchCount)
								) {
									yield result
								}
							}
						} catch {
							// Skip files we can't access
						}
					}
				}
			} catch {}
		}
	}

	#resolveOptions(options: GrepOptions): GrepFileTask['options'] {
		let caseInsensitive = options.caseInsensitive ?? false
		if (options.smartCase && !options.caseInsensitive) {
			const hasUppercase = options.pattern !== options.pattern.toLowerCase()
			if (!hasUppercase) {
				caseInsensitive = true
			}
		}

		return {
			caseInsensitive,
			wordRegexp: options.wordRegexp,
			invertMatch: options.invertMatch,
			count: options.count,
			filesWithMatches: options.filesWithMatches,
			filesWithoutMatch: options.filesWithoutMatch,
			maxColumnsPreview: options.maxColumnsPreview,
			onlyMatching: options.onlyMatching,
			contextBefore: options.contextBefore,
			contextAfter: options.contextAfter,
			context: options.context,
		}
	}

	#shouldIncludeEntry(
		entry: { name: string; kind: string },
		options: GrepOptions
	): boolean {
		if (!options.includeHidden && entry.name.startsWith('.')) {
			return false
		}

		if (entry.kind === 'directory') return true

		const name = entry.name

		if (
			options.excludePatterns &&
			this.#matchesPattern(name, options.excludePatterns)
		) {
			return false
		}

		if (options.typeNot) {
			const typePatterns = FILE_TYPES[options.typeNot]
			if (typePatterns && this.#matchesPattern(name, typePatterns)) {
				return false
			}
		}

		let matchedInclude = true
		if (options.includePatterns && options.includePatterns.length > 0) {
			matchedInclude = this.#matchesPattern(name, options.includePatterns)
		}
		if (!matchedInclude) return false

		if (options.type) {
			const typePatterns = FILE_TYPES[options.type]
			if (typePatterns) {
				if (!this.#matchesPattern(name, typePatterns)) {
					return false
				}
			}
		}

		return true
	}

	/**
	 * Check if a path segment matches any pattern in the list.
	 * Supports simple glob patterns like "*.test.ts".
	 */
	#matchesPattern(name: string, patterns: string[]): boolean {
		for (const pattern of patterns) {
			if (name === pattern) {
				return true
			}
			if (pattern.startsWith('*.')) {
				const ext = pattern.slice(1)
				if (name.endsWith(ext)) {
					return true
				}
			}
			if (pattern.endsWith('*') && !pattern.startsWith('*')) {
				const prefix = pattern.slice(0, -1)
				if (name.startsWith(prefix)) {
					return true
				}
			}
		}
		return false
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
			const proxy = wrap<GrepWorkerApi>(worker)
			this.#workerPool.push({ worker, proxy })
		}
	}

	/**
	 * Terminate all workers and cleanup resources.
	 */
	terminate(): void {
		this.#terminated = true
		for (const { worker } of this.#workerPool) {
			worker.terminate()
		}
		this.#workerPool = []
	}

	/**
	 * Get current worker pool size.
	 */
	get workerCount(): number {
		return this.#workerPool.length
	}
}
