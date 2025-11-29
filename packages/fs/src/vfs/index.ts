import {
	type FsContext,
	type FsContextOptions,
	type FsDirTreeNode,
	type FsTreeNode,
	type FsTreeOptions,
	type OpenMode,
	type VfsReadableStream
} from './types'
import { globToRegExp } from './utils/glob'
import { randomId } from './utils/random'
import {
	getParentPath,
	joinPaths,
	sanitizePath,
	segmentsToPath,
	toSegments
} from './utils/path'
import { throwIfAborted } from './utils/abort'
import { iterateDirectoryEntries } from './utils/dir'
import {
	bufferSourceToUint8Array,
	chunkByteLength,
	isReadableStream,
	textEncoder,
	writeToWritable
} from './utils/streams'
import { buildFsTree } from './utils/tree'

const TMP_DIR_NAME = '.tmp'

type ResolvedPath = {
	relative: string
	relativeSegments: string[]
	absolute: string
	absoluteSegments: string[]
}

type PermissionDescriptor = { mode?: 'read' | 'readwrite' }

type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
	requestPermission?: (
		descriptor: PermissionDescriptor
	) => Promise<PermissionState>
	queryPermission?: (
		descriptor: PermissionDescriptor
	) => Promise<PermissionState>
}

type SyncAccessHandle = {
	read: (buffer: BufferSource, opts?: { at?: number }) => number
	write: (buffer: BufferSource, opts?: { at?: number }) => number
	truncate: (size: number) => void
	flush?: () => void | Promise<void>
	getSize?: () => number
	close: () => void | Promise<void>
}

type SyncCapableFileHandle = FileSystemFileHandle & {
	createSyncAccessHandle?: () => Promise<SyncAccessHandle>
}

class FsContextImpl implements FsContext {
	readonly root: FileSystemDirectoryHandle
	readonly #baseSegments: string[]
	readonly #normalizePaths: boolean

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
			absoluteSegments
		}
	}

	async #getDirectoryHandle(
		segments: string[],
		create: boolean
	): Promise<FileSystemDirectoryHandle> {
		let current: FileSystemDirectoryHandle = this.root
		for (const segment of segments) {
			current = await current.getDirectoryHandle(segment, { create })
		}
		return current
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
		let current: FileSystemDirectoryHandle = this.root
		for (const segment of segments) {
			current = await current.getDirectoryHandle(segment, { create: true })
		}
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

	// Internal helpers used by VFile / VDir
	resolveRelative(path: string): ResolvedPath {
		const relativeSegments = this.#normalizePaths
			? toSegments(path, this.#normalizePaths)
			: sanitizePath(path).split('/').filter(Boolean)
		const absoluteSegments = [...this.#baseSegments, ...relativeSegments]

		return {
			relative: segmentsToPath(relativeSegments),
			relativeSegments,
			absolute: segmentsToPath(absoluteSegments),
			absoluteSegments
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
}

export class VFile {
	#ctx: FsContextImpl
	#mode: OpenMode

	readonly kind = 'file' as const
	readonly path: string
	readonly name: string
	readonly parent: VDir | null

	constructor(ctx: FsContext, path: string, mode: OpenMode = 'r') {
		const impl = ctx as FsContextImpl
		const resolved = impl.resolveRelative(path)
		if (!resolved.relative) {
			throw new Error('File path cannot be empty')
		}

		this.#ctx = impl
		this.#mode = mode
		this.path = resolved.relative
		this.name =
			resolved.relativeSegments[resolved.relativeSegments.length - 1] ?? ''

		const parentDirPath = getParentPath(resolved.relativeSegments)
		this.parent = parentDirPath === null ? null : new VDir(impl, parentDirPath)
	}

	async text(): Promise<string> {
		const file = await this.#getFile()
		return file.text()
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		const file = await this.#getFile()
		return file.arrayBuffer()
	}

	async stream(): Promise<VfsReadableStream> {
		const file = await this.#getFile()
		return file.stream() as VfsReadableStream
	}

	async json<T = unknown>(): Promise<T> {
		const content = await this.text()
		return JSON.parse(content) as T
	}

	async getSize(): Promise<number> {
		const file = await this.#getFile()
		return file.size
	}

	async getOriginFile(): Promise<File | undefined> {
		try {
			const handle = await this.#getHandle(false)
			if (typeof handle.getFile !== 'function') return undefined
			return handle.getFile()
		} catch {
			return undefined
		}
	}

	async lastModified(): Promise<number> {
		const file = await this.#getFile()
		return file.lastModified
	}

	async mimeType(): Promise<string | undefined> {
		const file = await this.#getFile()
		return file.type || undefined
	}

	async write(
		content: string | BufferSource | VfsReadableStream,
		opts?: { truncate?: boolean }
	): Promise<void> {
		await this.#ctx.ensureParentDirectories(this.path)
		const truncate = opts?.truncate ?? true
		const handle = await this.#getHandle(true)
		const writable = await handle.createWritable({
			keepExistingData: !truncate
		})

		try {
			await writeToWritable(writable, content)
		} finally {
			await writable.close()
		}
	}

	async append(
		content: string | BufferSource | VfsReadableStream
	): Promise<void> {
		await this.#ctx.ensureParentDirectories(this.path)

		let size = 0
		if (await this.exists()) {
			size = await this.getSize()
		}

		const writer = await this.createWriter()
		try {
			if (isReadableStream(content)) {
				const reader = content.getReader()
				let position = size

				while (true) {
					const { done, value } = await reader.read()
					if (done) break
					if (!value) continue
					const chunk =
						value instanceof Uint8Array
							? value
							: bufferSourceToUint8Array(value as BufferSource)
					await writer.write(chunk as BufferSource, { at: position })
					position += chunk.byteLength
				}
			} else {
				await writer.write(content, { at: size })
			}
		} finally {
			await writer.close()
		}
	}

	async writeJSON(
		value: unknown,
		opts?: { pretty?: boolean; truncate?: boolean }
	): Promise<void> {
		const content = opts?.pretty
			? JSON.stringify(value, null, 2)
			: JSON.stringify(value)
		await this.write(content, { truncate: opts?.truncate ?? true })
	}

	async createWriter(): Promise<{
		write: (
			chunk: string | BufferSource,
			opts?: { at?: number }
		) => Promise<number>
		truncate: (size: number) => Promise<void>
		flush: () => Promise<void>
		close: () => Promise<void>
	}> {
		await this.#ctx.ensureParentDirectories(this.path)
		const handle = await this.#getHandle(true)

		const syncHandle = handle as SyncCapableFileHandle
		if (
			this.#mode === 'rw-unsafe' &&
			typeof syncHandle.createSyncAccessHandle === 'function'
		) {
			const accessHandle = await syncHandle.createSyncAccessHandle()
			let closed = false

			const ensureOpen = () => {
				if (closed) {
					throw new Error('Writer is already closed')
				}
			}

			return {
				write: async (chunk, opts) => {
					ensureOpen()
					const data = bufferSourceToUint8Array(
						typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk
					)
					const bytes = accessHandle.write(
						data as BufferSource,
						opts?.at !== undefined ? { at: opts.at } : undefined
					)
					return typeof bytes === 'number' ? bytes : data.byteLength
				},
				truncate: async size => {
					ensureOpen()
					accessHandle.truncate(size)
				},
				flush: async () => {
					ensureOpen()
					if (typeof accessHandle.flush === 'function') {
						await accessHandle.flush()
					}
				},
				close: async () => {
					if (closed) return
					await accessHandle.close()
					closed = true
				}
			}
		}

		const writable = await handle.createWritable({ keepExistingData: true })
		let closed = false

		const ensureOpen = () => {
			if (closed) {
				throw new Error('Writer is already closed')
			}
		}

		return {
			write: async (chunk, opts) => {
				ensureOpen()
				if (opts?.at !== undefined) {
					await writable.write({
						type: 'write',
						position: opts.at,
						data: chunk
					})
				} else {
					await writable.write(chunk as FileSystemWriteChunkType)
				}
				return chunkByteLength(chunk)
			},
			truncate: async size => {
				ensureOpen()
				await writable.truncate(size)
			},
			flush: async () => {
				ensureOpen()
				if (
					typeof (
						writable as FileSystemWritableFileStream & {
							flush?: () => Promise<void>
						}
					).flush === 'function'
				) {
					await (
						writable as FileSystemWritableFileStream & {
							flush?: () => Promise<void>
						}
					).flush!()
				}
			},
			close: async () => {
				if (closed) return
				await writable.close()
				closed = true
			}
		}
	}

	async createReader(): Promise<{
		read: (size: number, opts?: { at?: number }) => Promise<ArrayBuffer>
		getSize: () => Promise<number>
		close: () => Promise<void>
	}> {
		const handle = await this.#getHandle(false)

		const syncHandle = handle as SyncCapableFileHandle
		if (
			this.#mode === 'rw-unsafe' &&
			typeof syncHandle.createSyncAccessHandle === 'function'
		) {
			const accessHandle = await syncHandle.createSyncAccessHandle()
			let closed = false

			const ensureOpen = () => {
				if (closed) {
					throw new Error('Reader is already closed')
				}
			}

			return {
				read: async (size, opts) => {
					ensureOpen()
					const buffer = new Uint8Array(size)
					const bytesRead = accessHandle.read(
						buffer,
						opts?.at !== undefined ? { at: opts.at } : undefined
					)
					return buffer.slice(
						0,
						typeof bytesRead === 'number' ? bytesRead : size
					).buffer
				},
				getSize: async () => {
					ensureOpen()
					return typeof accessHandle.getSize === 'function'
						? accessHandle.getSize()
						: this.getSize()
				},
				close: async () => {
					if (closed) return
					await accessHandle.close()
					closed = true
				}
			}
		}

		return {
			read: async (size, opts) => {
				const file = await this.#getFile()
				const start = opts?.at ?? 0
				const end = Math.min(start + size, file.size)
				const slice = file.slice(start, end)
				return slice.arrayBuffer()
			},
			getSize: async () => this.getSize(),
			close: async () => {
				// no-op for async reader
			}
		}
	}

	async exists(): Promise<boolean> {
		return this.#ctx.pathExistsAsFile(this.path)
	}

	async remove(opts?: { force?: boolean }): Promise<void> {
		try {
			await this.#ctx.remove(this.path, { recursive: false })
		} catch (error) {
			if (opts?.force) return
			throw error
		}
	}

	async copyTo(target: VDir | VFile): Promise<VFile> {
		if (target instanceof VDir) {
			await target.create()
			const destFile = target.getFile(this.name, this.#mode)
			await destFile.write(await this.stream(), { truncate: true })
			return destFile
		}

		if (
			target === this ||
			(target.path === this.path && target.#ctx === this.#ctx)
		) {
			return target
		}

		await target.write(await this.stream(), { truncate: true })
		return target
	}

	async moveTo(target: VDir | VFile): Promise<VFile> {
		const copied = await this.copyTo(target)
		await this.remove()
		return copied
	}

	async #getHandle(create: boolean): Promise<FileSystemFileHandle> {
		return this.#ctx.getFileHandleForRelative(this.path, create)
	}

	async #getFile(): Promise<File> {
		const handle = await this.#getHandle(false)
		return handle.getFile()
	}
}

export class VDir {
	#ctx: FsContextImpl

	readonly kind = 'dir' as const
	readonly path: string
	readonly name: string
	readonly parent: VDir | null

	constructor(ctx: FsContext, path: string) {
		const impl = ctx as FsContextImpl
		const resolved = impl.resolveRelative(path)

		this.#ctx = impl
		this.path = resolved.relative
		this.name =
			resolved.relativeSegments[resolved.relativeSegments.length - 1] ?? ''

		const parentDirPath = getParentPath(resolved.relativeSegments)
		this.parent = parentDirPath === null ? null : new VDir(impl, parentDirPath)
	}

	async create(): Promise<VDir> {
		await this.#ctx.getDirectoryHandleForRelative(this.path, true)
		return this
	}

	async exists(): Promise<boolean> {
		return this.#ctx.pathExistsAsDirectory(this.path)
	}

	async remove(opts?: { force?: boolean; recursive?: boolean }): Promise<void> {
		if (!this.path) {
			throw new Error('Cannot remove the root directory')
		}

		try {
			await this.#ctx.remove(this.path, {
				recursive: opts?.recursive,
				force: opts?.force
			})
		} catch (error) {
			if (opts?.force) return
			throw error
		}
	}

	async children(): Promise<Array<VDir | VFile>> {
		const handle = await this.#ctx.getDirectoryHandleForRelative(
			this.path,
			false
		)
		const results: Array<VDir | VFile> = []

		for await (const [name, entry] of iterateDirectoryEntries(handle)) {
			const childPath = joinPaths(this.path, name)
			if (entry.kind === 'directory') {
				results.push(new VDir(this.#ctx, childPath))
			} else {
				results.push(new VFile(this.#ctx, childPath))
			}
		}

		return results
	}

	getDir(path: string): VDir {
		const childPath = joinPaths(this.path, path)
		return new VDir(this.#ctx, childPath)
	}

	getFile(path: string, mode?: OpenMode): VFile {
		const childPath = joinPaths(this.path, path)
		return new VFile(this.#ctx, childPath, mode)
	}

	async tree(options?: FsTreeOptions): Promise<FsDirTreeNode> {
		return buildFsTree(this.#ctx, { path: this.path, name: this.name }, options)
	}

	async *walk(options?: {
		maxDepth?: number
		includeDirs?: boolean
		includeFiles?: boolean
		signal?: AbortSignal
		filter?(entry: VDir | VFile): boolean | Promise<boolean>
	}): AsyncGenerator<VDir | VFile, void, unknown> {
		const maxDepth = options?.maxDepth ?? Infinity
		const includeDirs = options?.includeDirs ?? true
		const includeFiles = options?.includeFiles ?? true

		const traverse = async function* (
			dir: VDir,
			depth: number
		): AsyncGenerator<VDir | VFile, void, unknown> {
			throwIfAborted(options?.signal)

			if (depth === 0 && includeDirs) {
				const allowed = options?.filter ? await options.filter(dir) : true
				if (allowed) {
					yield dir
				}
			}

			if (depth >= maxDepth) return

			const children = await dir.children()

			for (const child of children) {
				throwIfAborted(options?.signal)

				if (child.kind === 'dir') {
					const allowed = options?.filter ? await options.filter(child) : true
					if (allowed && includeDirs) {
						yield child
					}
					if (allowed) {
						yield* traverse(child, depth + 1)
					}
					continue
				}

				if (includeFiles) {
					const allowed = options?.filter ? await options.filter(child) : true
					if (allowed) {
						yield child
					}
				}
			}
		}

		yield* traverse(this, 0)
	}

	async *glob(pattern: string): AsyncGenerator<VFile | VDir, void, unknown> {
		const matcher = globToRegExp(pattern)
		const basePrefix = this.path ? `${this.path}/` : ''

		for await (const entry of this.walk()) {
			const relativePath =
				basePrefix && entry.path.startsWith(basePrefix)
					? entry.path.slice(basePrefix.length)
					: entry.path

			if (matcher.test(relativePath)) {
				yield entry
			}
		}
	}

	async copyTo(dest: VDir): Promise<VDir> {
		if (
			dest.path === this.path &&
			dest.parent?.path === this.parent?.path &&
			dest.#ctx === this.#ctx
		) {
			return dest
		}

		const destExists = await dest.exists()
		const targetDir = destExists ? dest.getDir(this.name) : dest
		await targetDir.create()

		const children = await this.children()
		for (const child of children) {
			if (child.kind === 'dir') {
				const copied = targetDir.getDir(child.name)
				await child.copyTo(copied)
			} else {
				const file = targetDir.getFile(child.name, 'rw')
				await file.write(await child.stream(), { truncate: true })
			}
		}

		return targetDir
	}

	async moveTo(dest: VDir): Promise<VDir> {
		const moved = await this.copyTo(dest)
		await this.remove({ recursive: true })
		return moved
	}
}

/**
 * Create a new FS context bound to a FileSystemDirectoryHandle.
 */
export function createFs(
	root: FileSystemDirectoryHandle,
	options?: FsContextOptions
): FsContext {
	return new FsContextImpl(root, options)
}

export const createVfs = createFs

export type { FsContext } from './types'
export * from './types'
