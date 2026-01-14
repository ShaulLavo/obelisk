import { afterEach, beforeEach, expect, test } from 'vitest'

import { createWorkerStorage, type WorkerStorage } from './workerStorage'

class MockSyncAccessHandle implements FileSystemSyncAccessHandle {
	private closed = false

	constructor(
		private readonly directory: MockDirectoryHandle,
		private file: MockFileHandle
	) {
		this.directory.activeHandles++
	}

	read(buffer: ArrayBufferView, options?: { at?: number }): number {
		const offset = options?.at ?? 0
		const available = Math.max(this.file.data.length - offset, 0)
		const length = Math.min(available, buffer.byteLength)
		const target = new Uint8Array(
			buffer.buffer,
			buffer.byteOffset,
			buffer.byteLength
		)
		if (length > 0) {
			target.set(this.file.data.subarray(offset, offset + length))
		}
		return length
	}

	write(buffer: ArrayBufferView, options?: { at?: number }): number {
		const offset = options?.at ?? 0
		const source = new Uint8Array(
			buffer.buffer,
			buffer.byteOffset,
			buffer.byteLength
		)
		const requiredSize = offset + source.length
		if (requiredSize > this.file.data.length) {
			const next = new Uint8Array(requiredSize)
			next.set(this.file.data)
			this.file.data = next
		}
		this.file.data.set(source, offset)
		return source.length
	}

	truncate(size: number): void {
		if (size >= this.file.data.length) return
		this.file.data = this.file.data.slice(0, size)
	}

	flush(): void {}

	getSize(): number {
		return this.file.data.length
	}

	close(): void {
		if (this.closed) return
		this.closed = true
		this.directory.activeHandles = Math.max(0, this.directory.activeHandles - 1)
	}
}

class MockFileHandle implements FileSystemFileHandle {
	readonly kind: 'file' = 'file'
	data = new Uint8Array()

	constructor(
		readonly name: string,
		private readonly directory: MockDirectoryHandle
	) {}

	async createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle> {
		return new MockSyncAccessHandle(this.directory, this)
	}

	async getFile(): Promise<File> {
		return new File([this.data], this.name)
	}

	async createWritable(): Promise<FileSystemWritableFileStream> {
		const chunks: Uint8Array[] = []
		const appendChunk = async (data: FileSystemWriteChunkType) => {
			if (data instanceof Blob) {
				chunks.push(new Uint8Array(await data.arrayBuffer()))
				return
			}
			if (typeof data === 'string') {
				const encoder = new TextEncoder()
				chunks.push(encoder.encode(data))
				return
			}
			if (ArrayBuffer.isView(data)) {
				const view = data as ArrayBufferView
				chunks.push(
					new Uint8Array(
						view.buffer.slice(
							view.byteOffset,
							view.byteOffset + view.byteLength
						)
					)
				)
				return
			}
			if (data instanceof ArrayBuffer) {
				chunks.push(new Uint8Array(data))
				return
			}
			// ignore unsupported chunks
		}

		return {
			write: async (chunk: FileSystemWriteChunkType) => {
				await appendChunk(chunk)
			},
			close: async () => {
				const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
				const next = new Uint8Array(length)
				let offset = 0
				for (const chunk of chunks) {
					next.set(chunk, offset)
					offset += chunk.length
				}
				this.data = next
			},
			seek: async () => {},
			truncate: async (size: number) => {
				if (size < this.data.length) {
					this.data = this.data.slice(0, size)
				}
			},
			abort: async () => {
				chunks.length = 0
			},
		} as unknown as FileSystemWritableFileStream
	}

	async isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return other === this
	}
}

class MockDirectoryHandle implements FileSystemDirectoryHandle {
	readonly kind: 'directory' = 'directory'
	readonly files = new Map<string, MockFileHandle>()
	activeHandles = 0

	constructor(readonly name: string = 'root') {}

	async getDirectoryHandle(
		_name: string,
		_options?: FileSystemGetDirectoryOptions
	): Promise<FileSystemDirectoryHandle> {
		throw new DOMException('NotFoundError', 'NotFoundError')
	}

	async getFileHandle(
		name: string,
		options?: FileSystemGetFileOptions
	): Promise<FileSystemFileHandle> {
		const existing = this.files.get(name)
		if (existing) return existing
		if (options?.create) {
			const handle = new MockFileHandle(name, this)
			this.files.set(name, handle)
			return handle
		}
		throw new DOMException('NotFoundError', 'NotFoundError')
	}

	async removeEntry(
		name: string,
		_options?: FileSystemRemoveOptions
	): Promise<void> {
		if (!this.files.delete(name)) {
			throw new DOMException('NotFoundError', 'NotFoundError')
		}
	}

	async resolve(
		_possibleDescendant: FileSystemHandle
	): Promise<string[] | null> {
		return null
	}

	async isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return other === this
	}

	async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
		for (const entry of this.files.entries()) {
			yield entry
		}
	}
}

interface TestEnvironment {
	directory: MockDirectoryHandle
	unloadHandlers: Array<() => void>
	restore(): void
}

let env: TestEnvironment

beforeEach(() => {
	env = setupEnvironment()
})

afterEach(() => {
	env.restore()
})

const setupEnvironment = (): TestEnvironment => {
	const directory = new MockDirectoryHandle()
	const unloadHandlers: Array<() => void> = []
	const storageManager = {
		getDirectory: async () => directory,
	}
	const originalNavigator = Object.getOwnPropertyDescriptor(
		globalThis,
		'navigator'
	)
	Object.defineProperty(globalThis, 'navigator', {
		value: { storage: storageManager },
		configurable: true,
	})
	const originalAddEventListener = globalThis.addEventListener
	globalThis.addEventListener = ((
		event: string,
		listener: EventListenerOrEventListenerObject
	) => {
		if (event === 'unload' && typeof listener === 'function') {
			unloadHandlers.push(listener as () => void)
		}
	}) as typeof globalThis.addEventListener

	return {
		directory,
		unloadHandlers,
		restore() {
			if (originalNavigator) {
				Object.defineProperty(globalThis, 'navigator', originalNavigator)
			} else {
				delete (globalThis as Record<string, unknown>).navigator
			}
			if (originalAddEventListener) {
				globalThis.addEventListener = originalAddEventListener
			} else {
				delete (globalThis as Record<string, unknown>).addEventListener
			}
			unloadHandlers.length = 0
		},
	}
}

const createStorage = async (): Promise<WorkerStorage> => {
	return createWorkerStorage()
}

const nextTick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

test('async set/get persist values and update keys', async () => {
	const storage = await createStorage()
	await storage.setItemAsync('foo', 'bar')
	expect(await storage.getItemAsync('foo')).toBe('bar')
	expect(storage.getItem('foo')).toBe('bar')
	expect(storage.keys()).toEqual(['foo'])
	expect(storage.length).toBe(1)
})

test('sync set falls back to async open when handle missing', async () => {
	const storage = await createStorage()
	storage.setItem('foo', 'bar')
	expect(storage.getItem('foo')).toBeNull()
	await nextTick()
	expect(await storage.getItemAsync('foo')).toBe('bar')
	expect(storage.getItem('foo')).toBe('bar')
})

test('removeItem deletes underlying file and closes handle', async () => {
	const storage = await createStorage()
	await storage.setItemAsync('foo', 'bar')
	await storage.removeItemAsync('foo')
	expect(storage.getItem('foo')).toBeNull()
	expect(env.directory.files.size).toBe(0)
	expect(env.directory.activeHandles).toBe(0)
})

test('clear removes all keys', async () => {
	const storage = await createStorage()
	await storage.setItemAsync('foo', 'bar')
	await storage.setItemAsync('baz', 'qux')
	await storage.clearAsync()
	expect(storage.length).toBe(0)
	expect(storage.keys()).toEqual([])
	expect(env.directory.files.size).toBe(0)
})

test('close releases handles and unload handler triggers close', async () => {
	const storage = await createStorage()
	await storage.setItemAsync('foo', 'bar')
	expect(env.directory.activeHandles).toBe(1)
	storage.close()
	expect(env.directory.activeHandles).toBe(0)

	env.unloadHandlers.length = 0
	const storageWithUnload = await createStorage()
	await storageWithUnload.setItemAsync('foo', 'bar')
	expect(env.unloadHandlers).toHaveLength(1)
	env.unloadHandlers.forEach((handler) => handler())
	expect(env.directory.activeHandles).toBe(0)
})
