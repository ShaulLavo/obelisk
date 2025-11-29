export type MemHandle = MemoryDirectoryHandle | MemoryFileHandle

export class MemoryFileHandle implements FileSystemFileHandle {
	readonly kind = 'file'
	readonly isFile = true
	readonly isDirectory = false
	readonly name: string
	#data = new Uint8Array()

	constructor(name: string) {
		this.name = name
	}

	async getFile(): Promise<File> {
		return new File([this.#data], this.name)
	}

	async createWritable(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_options?: FileSystemCreateWritableOptions
	): Promise<FileSystemWritableFileStream> {
		const chunks: Uint8Array[] = []

		const appendChunk = async (data: BufferSource | Blob | string) => {
			if (data instanceof Blob) {
				const buffer = await data.arrayBuffer()
				chunks.push(new Uint8Array(buffer))
				return
			}

			if (typeof data === 'string') {
				const encoder = new TextEncoder()
				chunks.push(encoder.encode(data))
				return
			}

			if (ArrayBuffer.isView(data)) {
				const view = data as ArrayBufferView
				const slice = view.buffer.slice(
					view.byteOffset,
					view.byteOffset + view.byteLength
				)
				chunks.push(new Uint8Array(slice))
				return
			}

			chunks.push(new Uint8Array(data as ArrayBufferLike))
		}

		return {
			write: async (data: BufferSource | Blob | string) => {
				await appendChunk(data)
			},
			close: async () => {
				const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
				const merged = new Uint8Array(length)
				let offset = 0

				for (const chunk of chunks) {
					merged.set(chunk, offset)
					offset += chunk.length
				}

				this.#data = merged
			},
			abort: async () => {
				// no-op
			},
			seek: async () => {
				// no-op
			},
			truncate: async () => {
				// no-op
			}
		} as unknown as FileSystemWritableFileStream
	}

	async queryPermission(): Promise<PermissionState> {
		return 'granted'
	}

	async requestPermission(): Promise<PermissionState> {
		return 'granted'
	}

	async isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return other === this
	}
}

export class MemoryDirectoryHandle implements FileSystemDirectoryHandle {
	readonly kind = 'directory'
	readonly isDirectory = true
	readonly isFile = false
	readonly name: string
	#children = new Map<string, MemHandle>()

	constructor(name: string) {
		this.name = name
	}

	async getDirectoryHandle(
		name: string,
		options?: FileSystemGetDirectoryOptions
	): Promise<MemoryDirectoryHandle> {
		const existing = this.#children.get(name)

		if (existing) {
			if (existing instanceof MemoryDirectoryHandle) {
				return existing
			}

			throw new TypeError(`${name} is a file, not a directory`)
		}

		if (!options?.create) {
			throw new DOMException('NotFoundError', 'NotFoundError')
		}

		const dir = new MemoryDirectoryHandle(name)
		this.#children.set(name, dir)
		return dir
	}

	async getFileHandle(
		name: string,
		options?: FileSystemGetFileOptions
	): Promise<MemoryFileHandle> {
		const existing = this.#children.get(name)

		if (existing) {
			if (existing instanceof MemoryFileHandle) {
				return existing
			}

			throw new TypeError(`${name} is a directory, not a file`)
		}

		if (!options?.create) {
			throw new DOMException('NotFoundError', 'NotFoundError')
		}

		const file = new MemoryFileHandle(name)
		this.#children.set(name, file)
		return file
	}

	async removeEntry(name: string, options?: FileSystemRemoveOptions) {
		if (!this.#children.has(name)) {
			throw new DOMException('NotFoundError', 'NotFoundError')
		}

		if (!options?.recursive) {
			const child = this.#children.get(name)
			if (child instanceof MemoryDirectoryHandle && child.#children.size > 0) {
				throw new DOMException(
					'InvalidModificationError',
					'InvalidModificationError'
				)
			}
		}

		this.#children.delete(name)
	}

	async resolve(
		possibleDescendant: FileSystemHandle
	): Promise<string[] | null> {
		if (possibleDescendant === this) {
			return []
		}

		return this.#resolveInternal(possibleDescendant)
	}

	#resolveInternal(possibleDescendant: FileSystemHandle): string[] | null {
		for (const [name, child] of this.#children.entries()) {
			if (child === possibleDescendant) {
				return [name]
			}

			if (child instanceof MemoryDirectoryHandle) {
				const nestedPath = child.#resolveInternal(possibleDescendant)

				if (nestedPath) {
					return [name, ...nestedPath]
				}
			}
		}

		return null
	}

	async *entries(): AsyncIterableIterator<[string, MemHandle]> {
		for (const entry of this.#children.entries()) {
			yield entry
		}
	}

	async *keys(): AsyncIterableIterator<string> {
		for (const [name] of this.#children.entries()) {
			yield name
		}
	}

	async *values(): AsyncIterableIterator<MemHandle> {
		for (const [, handle] of this.#children.entries()) {
			yield handle
		}
	}

	async *[Symbol.asyncIterator](): AsyncIterableIterator<[string, MemHandle]> {
		for await (const entry of this.entries()) {
			yield entry
		}
	}

	async queryPermission(): Promise<PermissionState> {
		return 'granted'
	}

	async requestPermission(): Promise<PermissionState> {
		return 'granted'
	}

	async isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return other === this
	}

	// Legacy Chromium <=85 aliases
	async getFile(
		name: string,
		options?: FileSystemGetFileOptions
	): Promise<FileSystemFileHandle> {
		return this.getFileHandle(name, options)
	}

	async getDirectory(
		name: string,
		options?: FileSystemGetDirectoryOptions
	): Promise<FileSystemDirectoryHandle> {
		return this.getDirectoryHandle(name, options)
	}

	getEntries(): AsyncIterableIterator<MemHandle> {
		return this.values()
	}
}

export async function getMemoryRoot(
	rootName = 'root'
): Promise<FileSystemDirectoryHandle> {
	const root = new MemoryDirectoryHandle(rootName)
	return root
}
