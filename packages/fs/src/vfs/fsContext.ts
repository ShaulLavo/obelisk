import {
	type FsContext,
	type FsContextOptions,
	type FsTreeNode,
	type OpenMode,
	type VfsReadableStream,
} from './types'
import { randomId } from './utils/random'
import { sanitizePath, segmentsToPath, toSegments } from './utils/path'
import type { ResolvedPath, FsContextInternal } from './contextInternal'
import { VFile } from './vfile'
import { VDir } from './vdir'

const TMP_DIR_NAME = '.tmp'
const DIR_HANDLE_CACHE_SIZE = 128

type PermissionDescriptor = { mode?: 'read' | 'readwrite' }

type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
	requestPermission?: (
		descriptor: PermissionDescriptor
	) => Promise<PermissionState>
	queryPermission?: (
		descriptor: PermissionDescriptor
	) => Promise<PermissionState>
}

/**
 * Simple LRU cache for directory handles.
 * Uses a Map (which maintains insertion order) and moves accessed items to the end.
 *
 * TODO: Future optimizations:
 * - Add FileSystemFileHandle pooling for "hot files" (frequently accessed files)
 *   to skip the getFileHandle() call on repeated access.
 * - Integrate with useFileSystemObserver to automatically invalidate cache entries
 *   when files/directories are renamed, moved, or deleted externally.
 */
class DirHandleCache {
	readonly #maxSize: number
	readonly #cache = new Map<string, FileSystemDirectoryHandle>()

	constructor(maxSize: number) {
		this.#maxSize = maxSize
	}

	get(key: string): FileSystemDirectoryHandle | undefined {
		const value = this.#cache.get(key)
		if (value !== undefined) {
			this.#cache.delete(key)
			this.#cache.set(key, value)
		}
		return value
	}

	set(key: string, value: FileSystemDirectoryHandle): void {
		if (this.#cache.size >= this.#maxSize) {
			const oldest = this.#cache.keys().next().value
			if (oldest !== undefined) {
				this.#cache.delete(oldest)
			}
		}
		this.#cache.set(key, value)
	}

	/** Invalidate all entries under a path prefix */
	invalidatePrefix(prefix: string): void {
		const toDelete: string[] = []
		for (const key of this.#cache.keys()) {
			if (key === prefix || key.startsWith(prefix + '/')) {
				toDelete.push(key)
			}
		}
		for (const key of toDelete) {
			this.#cache.delete(key)
		}
	}

	clear(): void {
		this.#cache.clear()
	}
}

export class FsContextImpl implements FsContextInternal {
	readonly root: FileSystemDirectoryHandle
	readonly #baseSegments: string[]
	readonly #normalizePaths: boolean
	readonly #dirHandleCache = new DirHandleCache(DIR_HANDLE_CACHE_SIZE)
	readonly #pendingOperations = new Map<
		string,
		Promise<FileSystemDirectoryHandle>
	>()

	constructor(root: FileSystemDirectoryHandle, options?: FsContextOptions) {
		this.root = root
		this.#normalizePaths = options?.normalizePaths ?? true
		this.#baseSegments = options?.basePath
			? toSegments(options.basePath, this.#normalizePaths)
			: []
	}

	file(path: string, mode?: OpenMode): VFile {
		const resolved = this.#resolvePath(path)
		return new VFile(this, resolved.relative, mode)
	}

	dir(path = ''): VDir {
		const resolved = this.#resolvePath(path)
		return new VDir(this, resolved.relative)
	}

	async readTextFiles(paths: string[]): Promise<Map<string, string>> {
		const results = new Map<string, string>()
		await Promise.all(
			paths.map(async (path) => {
				const content = await this.file(path).text()
				results.set(path, content)
			})
		)
		return results
	}

	async write(
		target: string | VFile,
		content: string | BufferSource | VfsReadableStream | VFile,
		opts?: { overwrite?: boolean }
	): Promise<void> {
		const overwrite = opts?.overwrite ?? true
		const file = typeof target === 'string' ? this.file(target, 'rw') : target

		if (typeof target === 'string' && !overwrite && (await file.exists())) {
			throw new Error(`File already exists at path "${file.path}"`)
		}

		if (content instanceof VFile) {
			const stream = await content.stream()
			await file.write(stream, { truncate: overwrite })
			return
		}

		await file.write(content, { truncate: overwrite })
	}

	async tmpfile(options?: {
		prefix?: string
		suffix?: string
	}): Promise<VFile> {
		const prefix = options?.prefix ?? ''
		const suffix = options?.suffix ?? ''
		const name = `${prefix}${randomId()}${suffix}`
		const dir = this.dir(TMP_DIR_NAME)
		await dir.create()
		return dir.getFile(name, 'rw')
	}

	async exists(path: string): Promise<boolean> {
		const resolved = this.#resolvePath(path)
		const segments = resolved.absoluteSegments

		const isFile = await this.#pathExistsAsFile(segments)
		if (isFile) return true

		return this.#pathExistsAsDirectory(segments)
	}

	async remove(
		path: string,
		opts?: {
			recursive?: boolean
			force?: boolean
		}
	): Promise<void> {
		const resolved = this.#resolvePath(path)
		if (resolved.absoluteSegments.length === 0) {
			throw new Error('Cannot remove the root directory')
		}

		const parentSegments = resolved.absoluteSegments.slice(0, -1)
		const name =
			resolved.absoluteSegments[resolved.absoluteSegments.length - 1]!

		try {
			const parent = await this.#getDirectoryHandle(parentSegments, false)
			await parent.removeEntry(name, { recursive: opts?.recursive })
		} catch (error) {
			if (opts?.force) return
			throw error
		}
	}

	async ensureDir(path: string): Promise<VDir> {
		const resolved = this.#resolvePath(path)
		await this.#ensureDirectory(resolved.absoluteSegments)
		return new VDir(this, resolved.relative)
	}

	async ensurePermission(mode: 'read' | 'readwrite'): Promise<PermissionState> {
		const handle = this.root as PermissionCapableDirectoryHandle
		if (typeof handle.requestPermission === 'function') {
			return handle.requestPermission({ mode })
		}

		return 'prompt'
	}

	async queryPermission(mode: 'read' | 'readwrite'): Promise<PermissionState> {
		const handle = this.root as PermissionCapableDirectoryHandle
		if (typeof handle.queryPermission === 'function') {
			return handle.queryPermission({ mode })
		}

		return 'prompt'
	}

	fromTreeNode(node: FsTreeNode): VFile | VDir {
		if (node.kind === 'file') {
			return this.file(node.path, 'rw')
		}

		return this.dir(node.path)
	}

	#resolvePath(path: string): ResolvedPath {
		const relativeSegments = toSegments(path, this.#normalizePaths)
		const relative = segmentsToPath(relativeSegments)
		const absoluteSegments = [...this.#baseSegments, ...relativeSegments]

		return {
			relative,
			relativeSegments,
			absolute: segmentsToPath(absoluteSegments),
			absoluteSegments,
		}
	}

	async #getDirectoryHandle(
		segments: string[],
		create: boolean
	): Promise<FileSystemDirectoryHandle> {
		if (segments.length === 0) {
			return this.root
		}

		const fullPath = segments.join('/')

		const cached = this.#dirHandleCache.get(fullPath)
		if (cached) {
			return cached
		}

		const opKey = `${fullPath}:${create}`
		const pending = this.#pendingOperations.get(opKey)
		if (pending) {
			return pending
		}

		const operation = (async () => {
			try {
				let startIndex = 0
				let current: FileSystemDirectoryHandle = this.root

				for (let i = segments.length - 1; i >= 0; i--) {
					const prefixPath = segments.slice(0, i).join('/')
					const prefixHandle = this.#dirHandleCache.get(prefixPath)
					if (prefixHandle) {
						current = prefixHandle
						startIndex = i
						break
					}
				}

				for (let i = startIndex; i < segments.length; i++) {
					current = await current.getDirectoryHandle(segments[i]!, { create })
					const intermediatePath = segments.slice(0, i + 1).join('/')
					this.#dirHandleCache.set(intermediatePath, current)
				}

				return current
			} finally {
				this.#pendingOperations.delete(opKey)
			}
		})()

		this.#pendingOperations.set(opKey, operation)
		return operation
	}

	async #getFileHandle(
		segments: string[],
		create: boolean
	): Promise<FileSystemFileHandle> {
		if (segments.length === 0) {
			throw new Error('File path cannot be empty')
		}

		const dirSegments = segments.slice(0, -1)
		const name = segments[segments.length - 1]!
		const dir = await this.#getDirectoryHandle(dirSegments, create)
		return dir.getFileHandle(name, { create })
	}

	async #ensureDirectory(segments: string[]): Promise<void> {
		// Reuse the cached getter which handles creation
		await this.#getDirectoryHandle(segments, true)
	}

	async #pathExistsAsFile(segments: string[]): Promise<boolean> {
		try {
			await this.#getFileHandle(segments, false)
			return true
		} catch {
			return false
		}
	}

	async #pathExistsAsDirectory(segments: string[]): Promise<boolean> {
		try {
			await this.#getDirectoryHandle(segments, false)
			return true
		} catch {
			return false
		}
	}

	resolveRelative(path: string): ResolvedPath {
		const relativeSegments = this.#normalizePaths
			? toSegments(path, this.#normalizePaths)
			: sanitizePath(path).split('/').filter(Boolean)
		const absoluteSegments = [...this.#baseSegments, ...relativeSegments]

		return {
			relative: segmentsToPath(relativeSegments),
			relativeSegments,
			absolute: segmentsToPath(absoluteSegments),
			absoluteSegments,
		}
	}

	getDirectoryHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemDirectoryHandle> {
		const resolved = this.resolveRelative(path)
		return this.#getDirectoryHandle(resolved.absoluteSegments, create)
	}

	getFileHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemFileHandle> {
		const resolved = this.resolveRelative(path)
		return this.#getFileHandle(resolved.absoluteSegments, create)
	}

	async ensureParentDirectories(relativePath: string): Promise<void> {
		const resolved = this.resolveRelative(relativePath)
		if (resolved.absoluteSegments.length <= 1) return
		const parentSegments = resolved.absoluteSegments.slice(0, -1)
		await this.#ensureDirectory(parentSegments)
	}

	async pathExistsAsFile(relativePath: string): Promise<boolean> {
		const resolved = this.resolveRelative(relativePath)
		return this.#pathExistsAsFile(resolved.absoluteSegments)
	}

	async pathExistsAsDirectory(relativePath: string): Promise<boolean> {
		const resolved = this.resolveRelative(relativePath)
		return this.#pathExistsAsDirectory(resolved.absoluteSegments)
	}

	/**
	 * Invalidate cached directory handles under the given path.
	 * Call this when external changes occur (e.g., from FileSystemObserver).
	 */
	invalidateCacheForPath(path: string): void {
		const resolved = this.resolveRelative(path)
		const absolutePath = resolved.absoluteSegments.join('/')
		this.#dirHandleCache.invalidatePrefix(absolutePath)
	}

	/** Clear the entire directory handle cache */
	clearCache(): void {
		this.#dirHandleCache.clear()
	}
}

export function createFs(
	root: FileSystemDirectoryHandle,
	options?: FsContextOptions
): FsContext {
	return new FsContextImpl(root, options)
}
