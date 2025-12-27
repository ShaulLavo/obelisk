import type { FsDirTreeNode } from '@repo/fs'
import { logger } from '~/logger'
import { formatBytes } from '@repo/utils'
import type { FsSource } from '../types'
import { IGNORED_SEGMENTS } from '../config/constants'
import type {
	PrefetchDirectoryLoadedPayload,
	PrefetchErrorPayload,
	PrefetchStatusMilestone,
	PrefetchStatusPayload,
	PrefetchTarget,
	TreePrefetchWorkerCallbacks,
	DeferredDirMetadata,
} from './treePrefetchWorkerTypes'
import {
	batchInsertFiles,
	initSqlite,
	type FileMetadata,
} from '../../workers/sqliteClient'

const MAX_PREFETCH_DEPTH = 6
const MAX_PREFETCHED_DIRS = Infinity
const STATUS_SAMPLE_INTERVAL = 50
const BATCH_SIZE = 8
const BATCH_DELAY_MS = 4
const INDEX_BATCH_SIZE = 100

const prefetchLogger = logger.withTag('prefetch')
const now = () =>
	typeof performance !== 'undefined' ? performance.now() : Date.now()

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
type PrefetchPriority = 'primary' | 'deferred'

type PrefetchQueueOptions = {
	workerCount: number
	loadDirectory: (target: PrefetchTarget) => Promise<FsDirTreeNode | undefined>
	callbacks: TreePrefetchWorkerCallbacks
}

export class PrefetchQueue {
	private readonly primaryQueue = new Map<string, PrefetchTarget>()
	private readonly deferredQueue = new Map<string, PrefetchTarget>()
	private readonly loadedDirPaths = new Set<string>()
	private readonly loadedDirFileCounts = new Map<string, number>()
	private readonly pendingResults: Record<
		PrefetchPriority,
		PrefetchDirectoryLoadedPayload[]
	> = {
		primary: [],
		deferred: [],
	}

	private sessionPrefetchCount = 0
	private processedCount = 0
	private totalDurationMs = 0
	private lastDurationMs = 0
	private indexedFileCount = 0
	private primaryPhaseComplete = false

	private running = false
	private stopRequested = false
	private disposed = false
	private drainPromise: Promise<void> | null = null
	private sessionToken = 0
	private source: FsSource = 'local'
	private runStartTime: number | undefined
	private readonly workerCount: number
	private loggedProcessedCount = 0
	private loggedIndexedCount = 0
	private readonly activeJobs: Record<PrefetchPriority, number> = {
		primary: 0,
		deferred: 0,
	}
	private readonly loggedDeferredPaths = new Set<string>()
	private deferredBytesTotal = 0
	private deferredSample: { path: string } | undefined
	private primaryPhaseLogged = false
	private deferredPhaseLogged = false

	private indexBatch: FileMetadata[] = []
	private indexFlushPromise: Promise<void> | null = null

	constructor(private readonly options: PrefetchQueueOptions) {
		this.workerCount = Math.max(1, Math.floor(options.workerCount))
		if (this.workerCount < 1) {
			throw new Error('PrefetchQueue requires at least one worker')
		}
		void initSqlite().catch((err) => {
			prefetchLogger.error('Failed to initialize SQLite for indexing', err)
		})
	}

	async resetForSource(source: FsSource) {
		this.source = source
		this.stopRequested = true
		this.sessionToken += 1
		const draining = this.drainPromise
		if (draining) {
			try {
				await draining
			} catch {
				// no-op
			}
		}
		this.stopRequested = false
		this.clearState()
	}

	async seedTree(tree?: FsDirTreeNode) {
		if (!tree) return
		const pending = this.ingestLoadedSubtree(tree)
		this.emitStatus(this.running)
		this.enqueueTargets(pending)
	}

	enqueueSubtree(node: FsDirTreeNode) {
		if (!node) return
		this.dropTargetFromQueues(node.path)
		const pending = this.ingestLoadedSubtree(node)
		this.emitStatus(this.running)
		this.enqueueTargets(pending)
	}

	markDirLoaded(path: string | undefined) {
		if (!path) return
		this.dropTargetFromQueues(path)
		if (this.loadedDirPaths.has(path)) {
			this.emitStatus(this.running)
			return
		}
		this.loadedDirPaths.add(path)
		this.emitStatus(this.running)
	}

	async dispose() {
		this.disposed = true
		this.stopRequested = true
		const draining = this.drainPromise
		if (draining) {
			try {
				await draining
			} catch {
				// no-op
			}
		}
		await this.flushIndexBatch()
		this.primaryQueue.clear()
		this.deferredQueue.clear()
		this.loadedDirPaths.clear()
		this.loadedDirFileCounts.clear()
		this.loggedDeferredPaths.clear()
		this.deferredBytesTotal = 0
		this.deferredSample = undefined
		this.primaryPhaseLogged = false
		this.deferredPhaseLogged = false
	}

	private clearState() {
		this.primaryQueue.clear()
		this.deferredQueue.clear()
		this.loadedDirPaths.clear()
		this.loadedDirFileCounts.clear()
		this.pendingResults.primary.length = 0
		this.pendingResults.deferred.length = 0
		this.sessionPrefetchCount = 0
		this.processedCount = 0
		this.totalDurationMs = 0
		this.lastDurationMs = 0
		this.indexedFileCount = 0
		this.runStartTime = undefined
		this.loggedProcessedCount = 0
		this.loggedIndexedCount = 0
		this.primaryPhaseComplete = false
		this.activeJobs.primary = 0
		this.activeJobs.deferred = 0
		this.primaryPhaseLogged = false
		this.deferredPhaseLogged = false
		this.emitStatus(false)
	}

	private hasPrefetchBudget() {
		return (
			this.sessionPrefetchCount < MAX_PREFETCHED_DIRS &&
			this.loadedDirPaths.size < MAX_PREFETCHED_DIRS
		)
	}

	private hasPendingTargets() {
		return this.primaryQueue.size > 0 || this.deferredQueue.size > 0
	}

	private shouldDeferPath(path: string | undefined) {
		if (!path) return false
		const segments = path.split('/').filter(Boolean)
		return segments.some((segment) => IGNORED_SEGMENTS.has(segment))
	}

	private shouldSkipTarget(target: PrefetchTarget) {
		if (!target.path) return true
		if (target.depth > MAX_PREFETCH_DEPTH) return true
		if (this.loadedDirPaths.has(target.path)) return true
		return false
	}

	private enqueueTargets(targets: readonly PrefetchTarget[]) {
		let added = false
		for (const target of targets) {
			if (!this.hasPrefetchBudget()) break
			if (this.shouldSkipTarget(target)) continue
			const isDeferred = this.shouldDeferPath(target.path)
			const queue = isDeferred ? this.deferredQueue : this.primaryQueue
			if (queue.has(target.path)) continue
			queue.set(target.path, target)
			if (!isDeferred) {
				this.primaryPhaseComplete = false
				this.primaryPhaseLogged = false
			} else {
				this.deferredPhaseLogged = false
			}
			added = true
		}

		if (added) {
			this.scheduleProcessing()
		}
	}

	private scheduleProcessing() {
		if (this.disposed || this.stopRequested) return
		if (this.drainPromise) return
		if (!this.hasPendingTargets()) return
		if (!this.hasPrefetchBudget()) {
			this.primaryQueue.clear()
			this.deferredQueue.clear()
			return
		}

		this.running = true
		if (this.runStartTime === undefined) {
			this.runStartTime = now()
		}
		this.emitStatus(true)
		this.drainPromise = Promise.all(
			Array.from({ length: this.workerCount }, () =>
				this.workerLoop(this.sessionToken)
			)
		)
			.then(() => undefined)
			.finally(() => {
				this.drainPromise = null
				this.running = false
				this.emitStatus(false)
				this.logCompletion()
				if (!this.disposed && this.hasPendingTargets()) {
					this.scheduleProcessing()
				}
			})
	}

	private takeFromQueue(
		queue: Map<string, PrefetchTarget>
	): PrefetchTarget | undefined {
		const iterator = queue.entries().next()
		if (iterator.done) {
			return undefined
		}
		const [path, target] = iterator.value
		queue.delete(path)
		return target
	}

	private dequeueNextTarget():
		| { target: PrefetchTarget; priority: PrefetchPriority }
		| undefined {
		const primaryTarget = this.takeFromQueue(this.primaryQueue)
		if (primaryTarget) {
			return { target: primaryTarget, priority: 'primary' }
		}

		if (!this.primaryPhaseComplete) {
			if (this.activeJobs.primary === 0) {
				this.markPrimaryPhaseComplete()
			} else {
				return undefined
			}
		}

		if (this.primaryPhaseComplete) {
			const deferredTarget = this.takeFromQueue(this.deferredQueue)
			if (deferredTarget) {
				return { target: deferredTarget, priority: 'deferred' }
			}
			if (this.activeJobs.deferred === 0) {
				this.flushPhaseResults('deferred')
				if (!this.deferredPhaseLogged) {
					this.deferredPhaseLogged = true
					this.logPhaseCompletion('deferred')
				}
			}
		}

		return undefined
	}

	private flushPhaseResults(priority: PrefetchPriority) {
		if (priority === 'deferred') {
			this.pendingResults.deferred.length = 0
			return
		}
		const pending = this.pendingResults[priority]
		if (!pending.length) return
		while (pending.length) {
			const payload = pending.shift()
			if (!payload) continue
			this.options.callbacks.onDirectoryLoaded(payload)
		}
	}

	private markPrimaryPhaseComplete() {
		if (!this.primaryPhaseComplete) {
			this.primaryPhaseComplete = true
		}
		this.flushPhaseResults('primary')
		if (!this.primaryPhaseLogged) {
			this.primaryPhaseLogged = true
			this.logPhaseCompletion('primary')
		}
	}

	private logDeferredPayload(node: DeferredDirMetadata) {
		const path = node.path || node.name
		if (this.loggedDeferredPaths.has(path)) return
		this.loggedDeferredPaths.add(path)
		const byteLength =
			typeof Blob !== 'undefined'
				? new Blob([JSON.stringify(node)]).size
				: new TextEncoder().encode(JSON.stringify(node)).byteLength
		this.deferredBytesTotal += byteLength
		if (!this.deferredSample) {
			this.deferredSample = { path }
		}
	}

	private async workerLoop(sessionToken: number) {
		while (
			!this.disposed &&
			!this.stopRequested &&
			sessionToken === this.sessionToken
		) {
			if (!this.hasPrefetchBudget()) {
				this.primaryQueue.clear()
				this.deferredQueue.clear()
				return
			}

			const next = this.dequeueNextTarget()
			if (!next) {
				return
			}

			const jobStart = now()
			const { target, priority } = next
			this.activeJobs[priority] += 1

			try {
				const subtree = await this.options.loadDirectory(target)
				if (!subtree || sessionToken !== this.sessionToken) {
					return
				}
				this.sessionPrefetchCount += 1
				const pending = this.ingestLoadedSubtree(subtree)
				const payload: PrefetchDirectoryLoadedPayload = { node: subtree }
				if (priority === 'primary') {
					this.pendingResults.primary.push(payload)
				} else {
					const deferredMetadata: DeferredDirMetadata = {
						kind: subtree.kind,
						name: subtree.name,
						path: subtree.path,
						parentPath: subtree.parentPath,
						depth: subtree.depth,
						isLoaded: subtree.isLoaded,
					}
					this.logDeferredPayload(deferredMetadata)
					this.options.callbacks.onDeferredMetadata?.({
						node: deferredMetadata,
					})
				}
				this.enqueueTargets(pending)
				if (!this.hasPrefetchBudget()) {
					this.primaryQueue.clear()
					this.deferredQueue.clear()
				}
				const duration = now() - jobStart
				this.lastDurationMs = duration
				this.totalDurationMs += duration
				this.processedCount += 1
				const milestoneReached =
					this.processedCount > 0 &&
					this.processedCount % STATUS_SAMPLE_INTERVAL === 0
				this.emitStatus(true, milestoneReached)
				if (this.processedCount % BATCH_SIZE === 0) {
					await delay(BATCH_DELAY_MS)
				}
			} catch (error) {
				if (sessionToken !== this.sessionToken) {
					return
				}
				const message =
					error instanceof Error
						? error.message
						: 'Failed to prefetch directory'
				const payload: PrefetchErrorPayload = { message }
				this.options.callbacks.onError?.(payload)
			} finally {
				this.activeJobs[priority] -= 1
				if (
					priority === 'primary' &&
					this.primaryQueue.size === 0 &&
					this.activeJobs.primary === 0
				) {
					this.markPrimaryPhaseComplete()
				}
				if (
					priority === 'deferred' &&
					this.deferredQueue.size === 0 &&
					this.activeJobs.deferred === 0
				) {
					this.flushPhaseResults('deferred')
					if (!this.deferredPhaseLogged) {
						this.deferredPhaseLogged = true
						this.logPhaseCompletion('deferred')
					}
				}
			}
		}
	}

	private dropTargetFromQueues(path: string | undefined) {
		if (!path) return
		this.primaryQueue.delete(path)
		this.deferredQueue.delete(path)
	}

	private trackLoadedDirectory(dir: FsDirTreeNode) {
		if (dir.kind !== 'dir') return
		if (dir.isLoaded === false) return
		const path = dir.path ?? ''
		this.loadedDirPaths.add(path)
		const children = dir.children

		const filesToIndex: FileMetadata[] = []

		const fileCount = !children
			? 0
			: children.reduce((count, child) => {
					if (child.kind === 'file') {
						filesToIndex.push({ path: child.path, kind: 'file' })
						return count + 1
					} else if (child.kind === 'dir') {
						filesToIndex.push({ path: child.path, kind: 'dir' })
					}
					return count
				}, 0)

		if (filesToIndex.length > 0) {
			this.indexBatch.push(...filesToIndex)
			if (this.indexBatch.length >= INDEX_BATCH_SIZE) {
				void this.flushIndexBatch()
			}
		}

		const previous = this.loadedDirFileCounts.get(path) ?? 0
		if (fileCount === previous) return
		this.loadedDirFileCounts.set(path, fileCount)
		this.indexedFileCount += fileCount - previous
	}

	private async flushIndexBatch() {
		if (this.indexBatch.length === 0) return
		const batch = [...this.indexBatch]
		this.indexBatch = []

		try {
			await batchInsertFiles(batch)
		} catch (err) {
			prefetchLogger.error('Failed to batch insert files to SQLite', err)
		}
	}

	private ingestLoadedSubtree(node: FsDirTreeNode) {
		if (node.kind !== 'dir') return [] as PrefetchTarget[]
		const stack: FsDirTreeNode[] = [node]
		const pending: PrefetchTarget[] = []

		while (stack.length) {
			const dir = stack.pop()!
			this.trackLoadedDirectory(dir)

			for (const child of dir.children) {
				if (child.kind !== 'dir') continue
				if (child.isLoaded === false) {
					pending.push({
						path: child.path,
						name: child.name,
						depth: child.depth,
						parentPath: child.parentPath,
					})
				} else {
					stack.push(child)
				}
			}
		}

		return pending
	}

	private emitStatus(running: boolean, milestone = false) {
		const payload: PrefetchStatusPayload = {
			running,
			pending: this.primaryQueue.size,
			deferred: this.deferredQueue.size,
			indexedFileCount: this.indexedFileCount,
			processedCount: this.processedCount,
			lastDurationMs: this.lastDurationMs,
			averageDurationMs: this.processedCount
				? this.totalDurationMs / this.processedCount
				: 0,
		}

		if (milestone) {
			const milestonePayload: PrefetchStatusMilestone = {
				processedCount: this.processedCount,
				pending: this.primaryQueue.size,
				deferred: this.deferredQueue.size,
				indexedFileCount: this.indexedFileCount,
				lastDurationMs: this.lastDurationMs,
				averageDurationMs: payload.averageDurationMs,
			}
			payload.milestone = milestonePayload
		}

		this.options.callbacks.onStatus(payload)
	}

	private logCompletion() {
		const hasWork = this.running || this.hasPendingTargets()
		if (hasWork) {
			return
		}

		void this.flushIndexBatch()

		const processedDelta = this.processedCount - this.loggedProcessedCount
		if (processedDelta <= 0) {
			return
		}

		const duration =
			this.runStartTime !== undefined
				? now() - this.runStartTime
				: this.totalDurationMs
		const deferredSummary =
			this.deferredBytesTotal > 0
				? `, deferred ${formatBytes(this.deferredBytesTotal)} across ${this.loggedDeferredPaths.size} dirs${
						this.deferredSample
							? ` (sample path=${this.deferredSample.path}`
							: ''
					}`
				: ''
		prefetchLogger.info(
			`prefetch finished in ${duration.toFixed(1)}ms (${processedDelta} dirs, ${
				this.indexedFileCount - this.loggedIndexedCount
			} files indexed${deferredSummary})`
		)
		this.runStartTime = undefined
		this.loggedProcessedCount = this.processedCount
		this.loggedIndexedCount = this.indexedFileCount
	}

	private logPhaseCompletion(kind: PrefetchPriority) {
		const elapsed =
			this.runStartTime !== undefined ? now() - this.runStartTime : 0
		prefetchLogger.info(
			`prefetch ${kind} phase completed after ${elapsed.toFixed(1)}ms`
		)
	}
}
