import {
	getMemoryRoot,
	MemoryDirectoryHandle,
	MemoryFileHandle,
} from '@repo/fs'
import {
	DEFAULT_ROOT_NAME,
	deriveRelativeSegments,
	getSharedTopSegment,
	normalizeEntries,
} from './importDirectoryEntries'

/** Default number of concurrent file operations */
const DEFAULT_CONCURRENCY = 16

/**
 * Simple semaphore for bounded concurrency.
 * Limits the number of concurrent async operations.
 */
class Semaphore {
	private queue: (() => void)[] = []
	private running = 0

	constructor(private readonly limit: number) {}

	async acquire(): Promise<void> {
		if (this.running < this.limit) {
			this.running++
			return
		}
		return new Promise<void>((resolve) => {
			this.queue.push(resolve)
		})
	}

	release(): void {
		this.running--
		const next = this.queue.shift()
		if (next) {
			this.running++
			next()
		}
	}

	async run<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire()
		try {
			return await fn()
		} finally {
			this.release()
		}
	}
}

/**
 * Cache for directory handles to avoid redundant lookups.
 * Maps normalized path strings to directory handles.
 */
const dirCache = new Map<string, Promise<MemoryDirectoryHandle>>()

const ensureDirectory = async (
	root: MemoryDirectoryHandle,
	segments: readonly string[]
): Promise<MemoryDirectoryHandle> => {
	if (segments.length === 0) return root

	const key = segments.join('/')
	const cached = dirCache.get(key)
	if (cached) return cached

	// Build up the path incrementally to populate cache for parent dirs too
	const promise = (async () => {
		let current = root
		let pathSoFar = ''

		for (const segment of segments) {
			pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment
			const existingPromise = dirCache.get(pathSoFar)

			if (existingPromise) {
				current = await existingPromise
			} else {
				const dirPromise = current.getDirectoryHandle(segment, {
					create: true,
				}) as Promise<MemoryDirectoryHandle>
				dirCache.set(pathSoFar, dirPromise)
				current = await dirPromise
			}
		}
		return current
	})()

	dirCache.set(key, promise)
	return promise
}

const writeFileToMemory = async (
	root: MemoryDirectoryHandle,
	segments: readonly string[],
	file: File
): Promise<void> => {
	const directorySegments = segments.slice(0, -1)
	const fileName = segments[segments.length - 1]!
	const targetDir = await ensureDirectory(root, directorySegments)
	const handle = (await targetDir.getFileHandle(fileName, {
		create: true,
	})) as MemoryFileHandle
	const writable = await handle.createWritable()
	let aborted = false
	try {
		const buffer = await file.arrayBuffer()
		await writable.write(buffer)
	} catch (error) {
		aborted = true
		if (writable.abort) {
			await writable.abort()
		}
		throw error
	} finally {
		if (!aborted) {
			await writable.close()
		}
	}
}

export interface ImportOptions {
	/** Max concurrent file operations (default: 16) */
	concurrency?: number
	/** Progress callback, called after each file completes */
	onProgress?: (completed: number, total: number) => void
}

export async function importDirectoryToMemory(
	files: FileList,
	options: ImportOptions = {}
): Promise<MemoryDirectoryHandle> {
	const { concurrency = DEFAULT_CONCURRENCY, onProgress } = options

	const entries = normalizeEntries(files)
	if (entries.length === 0) {
		throw new Error('No files provided for import.')
	}

	const sharedTop = getSharedTopSegment(entries)
	const rootName = sharedTop ?? DEFAULT_ROOT_NAME
	const root = (await getMemoryRoot(rootName)) as MemoryDirectoryHandle

	// Clear directory cache for this import
	dirCache.clear()

	const semaphore = new Semaphore(concurrency)
	const total = entries.length
	let completed = 0

	// Process all files with bounded concurrency
	const tasks = entries.map((entry) =>
		semaphore.run(async () => {
			const segments = deriveRelativeSegments(entry, sharedTop)
			await writeFileToMemory(root, segments, entry.file)
			completed++
			onProgress?.(completed, total)
		})
	)

	const results = await Promise.allSettled(tasks)

	// Clear cache after import
	dirCache.clear()

	// Collect and report any errors
	const errors = results
		.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
		.map((r) => r.reason)

	if (errors.length > 0) {
		const message =
			errors.length === 1
				? `Import failed: ${errors[0]}`
				: `Import failed with ${errors.length} errors. First error: ${errors[0]}`
		throw new AggregateError(errors, message)
	}

	return root
}
