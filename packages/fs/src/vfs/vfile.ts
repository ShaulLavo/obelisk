import { type FsContext, type OpenMode, type VfsReadableStream } from './types'
import { getParentPath } from './utils/path'
import {
	bufferSourceToUint8Array,
	chunkByteLength,
	isReadableStream,
	textEncoder,
	writeToWritable
} from './utils/streams'
import type { FsContextInternal } from './contextInternal'
import { VDir } from './vdir'

export type SyncAccessHandle = {
	read: (buffer: BufferSource, opts?: { at?: number }) => number
	write: (buffer: BufferSource, opts?: { at?: number }) => number
	truncate: (size: number) => void
	flush?: () => void | Promise<void>
	getSize?: () => number
	close: () => void | Promise<void>
}

export type SyncCapableFileHandle = FileSystemFileHandle & {
	createSyncAccessHandle?: () => Promise<SyncAccessHandle>
}

export class VFile {
	#ctx: FsContextInternal
	#mode: OpenMode
	#fileSnapshot: Promise<File> | null = null

	readonly kind = 'file' as const
	readonly path: string
	readonly name: string
	readonly parent: VDir | null

	constructor(ctx: FsContext, path: string, mode: OpenMode = 'r') {
		const impl = ctx as FsContextInternal
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
			this.#invalidateFileSnapshot()
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
			const invalidate = () => {
				this.#invalidateFileSnapshot()
			}

			return {
				write: async (chunk, opts) => {
					ensureOpen()
					const data = bufferSourceToUint8Array(
						typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk
					)
					const bytes = accessHandle.write(
						data,
						opts?.at !== undefined ? { at: opts.at } : undefined
					)
					invalidate()
					return typeof bytes === 'number' ? bytes : data.byteLength
				},
				truncate: async size => {
					ensureOpen()
					accessHandle.truncate(size)
					invalidate()
				},
				flush: async () => {
					ensureOpen()
					if (typeof accessHandle.flush === 'function') {
						accessHandle.flush()
					}
					invalidate()
				},
				close: async () => {
					if (closed) return
					accessHandle.close()
					closed = true
					invalidate()
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
		const invalidate = () => {
			this.#invalidateFileSnapshot()
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
				invalidate()
				return chunkByteLength(chunk)
			},
			truncate: async size => {
				ensureOpen()
				await writable.truncate(size)
				invalidate()
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
				invalidate()
			},
			close: async () => {
				if (closed) return
				await writable.close()
				closed = true
				invalidate()
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
			this.#invalidateFileSnapshot()
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

	#invalidateFileSnapshot(): void {
		this.#fileSnapshot = null
	}

	async #getFile(opts?: { fresh?: boolean }): Promise<File> {
		if (!opts?.fresh && this.#fileSnapshot) {
			return this.#fileSnapshot
		}

		const promise = this.#getHandle(false).then(handle => handle.getFile())
		this.#fileSnapshot = promise

		try {
			return await promise
		} catch (error) {
			if (this.#fileSnapshot === promise) {
				this.#fileSnapshot = null
			}
			throw error
		}
	}
}
