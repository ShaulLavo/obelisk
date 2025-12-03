import type { FsSource } from '../types'
import { getOrCreateFileHandle } from './fileHandles'
import { ensureFs } from './fsRuntime'

const pendingFileTextReads = new Map<string, Promise<string>>()
const pendingSafeFileTextReads = new Map<string, Promise<SafeReadResult>>()
const pendingStreamReads = new Map<string, Promise<string>>()
const streamControllers = new Map<string, AbortController>()
const DEFAULT_CHUNK_SIZE = 1024 * 1024 * 1 // 1 MB

export type SafeReadOptions = {
	sizeLimitBytes?: number
	chunkSize?: number
}

export type SafeReadResult = {
	text: string
	truncated: boolean
	totalSize?: number
}

export type FileTextStreamOptions = {
	chunkSize?: number
}

export type FileTextChunk = {
	done: boolean
	chunk?: string
	offset: number
	bytesRead: number
}

export type FileTextStream = {
	getSize(): Promise<number>
	readNext(): Promise<FileTextChunk>
	readAt(offset: number): Promise<FileTextChunk>
	close(): Promise<void>
}

const resolveChunkSize = (chunkSize?: number) =>
	chunkSize && chunkSize > 0 ? chunkSize : DEFAULT_CHUNK_SIZE

const trackPendingRead = <T>(
	cache: Map<string, Promise<T>>,
	key: string,
	operation: () => Promise<T>
): Promise<T> => {
	const pending = cache.get(key)
	if (pending) return pending

	const promise = (async () => {
		try {
			return await operation()
		} finally {
			cache.delete(key)
		}
	})()

	cache.set(key, promise)
	return promise
}

export function resetStreamingState() {
	streamControllers.forEach(controller => controller.abort())
	streamControllers.clear()
	pendingFileTextReads.clear()
	pendingSafeFileTextReads.clear()
	pendingStreamReads.clear()
}

export function cancelOtherStreams(keepPath: string) {
	for (const [path, controller] of streamControllers) {
		if (path === keepPath) continue
		controller.abort()
		streamControllers.delete(path)
		pendingStreamReads.delete(path)
	}
}

export async function readFileText(
	source: FsSource,
	path: string
): Promise<string> {
	return trackPendingRead(pendingFileTextReads, path, async () => {
		const ctx = await ensureFs(source)
		const handle = await getOrCreateFileHandle(ctx, path)
		const file = await handle.getFile()
		return file.text()
	})
}

export async function getFileSize(
	source: FsSource,
	path: string
): Promise<number> {
	const ctx = await ensureFs(source)
	const handle = await getOrCreateFileHandle(ctx, path)
	const file = await handle.getFile()
	return file.size
}

export async function readFilePreviewBytes(
	source: FsSource,
	path: string,
	maxBytes = Infinity
): Promise<Uint8Array> {
	const ctx = await ensureFs(source)
	const handle = await getOrCreateFileHandle(ctx, path)
	const file = await handle.getFile()
	const fileSize = file.size
	if (fileSize === 0) return new Uint8Array()
	const toRead = Math.min(Math.max(maxBytes, 0), fileSize)
	const buffer = await file.slice(0, toRead).arrayBuffer()
	return new Uint8Array(buffer)
}

export async function safeReadFileText(
	source: FsSource,
	path: string,
	options?: SafeReadOptions
): Promise<SafeReadResult> {
	const chunkSize = resolveChunkSize(options?.chunkSize)
	const sizeLimit = options?.sizeLimitBytes

	return trackPendingRead(pendingSafeFileTextReads, path, async () => {
		const ctx = await ensureFs(source)
		const handle = await getOrCreateFileHandle(ctx, path)
		const file = await handle.getFile()
		const fileSize = file.size

		let offset = 0
		let loadedBytes = 0
		let truncated = false
		const decoder = new TextDecoder()
		const segments: string[] = []

		while (offset < fileSize) {
			const remainingBytes = fileSize - offset
			let toRead = Math.min(chunkSize, remainingBytes)

			if (sizeLimit !== undefined) {
				if (loadedBytes >= sizeLimit) {
					truncated = true
					break
				}

				if (loadedBytes + toRead > sizeLimit) {
					toRead = sizeLimit - loadedBytes
					truncated = true
				}
			}

			if (toRead <= 0) {
				truncated = sizeLimit !== undefined
				break
			}

			const buffer = await file.slice(offset, offset + toRead).arrayBuffer()
			const bytes = new Uint8Array(buffer)
			const bytesRead = bytes.byteLength

			if (bytesRead === 0) break

			const chunk = decoder.decode(bytes, {
				stream: offset + bytesRead < fileSize
			})
			if (chunk) {
				segments.push(chunk)
			}

			offset += bytesRead
			loadedBytes += bytesRead

			if (truncated) break
		}

		const flushed = decoder.decode()
		if (flushed) {
			segments.push(flushed)
		}

		return {
			text: segments.join(''),
			truncated,
			totalSize: fileSize
		}
	})
}

export async function createFileTextStream(
	source: FsSource,
	path: string,
	options?: FileTextStreamOptions
): Promise<FileTextStream> {
	const chunkSize = resolveChunkSize(options?.chunkSize)
	const ctx = await ensureFs(source)
	const handle = await getOrCreateFileHandle(ctx, path)
	const file = await handle.getFile()
	const fileSize = file.size

	let position = 0
	let closed = false
	const sequentialDecoder = new TextDecoder('utf-8', {
		fatal: true,
		ignoreBOM: true
	})

	const ensureOpen = () => {
		if (closed) {
			throw new Error('FileTextStream is closed')
		}
	}

	const readAt = async (offset: number): Promise<FileTextChunk> => {
		ensureOpen()

		if (offset >= fileSize) {
			return { done: true, offset, bytesRead: 0 }
		}

		const remaining = fileSize - offset
		const toRead = Math.min(chunkSize, remaining)
		const buffer = await file.slice(offset, offset + toRead).arrayBuffer()
		const bytes = new Uint8Array(buffer)
		const bytesRead = bytes.byteLength

		if (bytesRead === 0) {
			return { done: true, offset, bytesRead }
		}

		const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

		let chunk = ''
		try {
			chunk = decoder.decode(bytes, {
				stream: false
			})
		} catch (e) {
			throw new Error(`Failed to decode file chunk at offset ${offset}: ${e}`)
		}

		return {
			done: false,
			chunk,
			offset,
			bytesRead
		}
	}

	const readNext = async (): Promise<FileTextChunk> => {
		ensureOpen()

		if (position >= fileSize) {
			return { done: true, offset: position, bytesRead: 0 }
		}

		const offset = position
		const remaining = fileSize - position
		const toRead = Math.min(chunkSize, remaining)
		const buffer = await file.slice(offset, offset + toRead).arrayBuffer()
		const bytes = new Uint8Array(buffer)
		const bytesRead = bytes.byteLength

		if (bytesRead === 0) {
			return { done: true, offset, bytesRead }
		}
		let chunk = ''
		try {
			chunk = sequentialDecoder.decode(bytes, {
				stream: offset + bytesRead < fileSize
			})
		} catch (e) {
			throw new Error(`Failed to decode file chunk at offset ${offset}: ${e}`)
		}

		position += bytesRead

		return {
			done: false,
			chunk,
			offset,
			bytesRead
		}
	}

	const close = async () => {
		if (closed) return
		closed = true
		sequentialDecoder.decode()
	}

	return {
		getSize: async () => fileSize,
		readAt,
		readNext,
		close
	}
}

export async function streamFileText(
	source: FsSource,
	path: string,
	onChunk?: (text: string) => void
): Promise<string> {
	const pending = pendingStreamReads.get(path)
	if (pending) return pending

	const controller = new AbortController()
	streamControllers.get(path)?.abort()
	streamControllers.set(path, controller)

	return trackPendingRead(pendingStreamReads, path, async () => {
		let stream: FileTextStream | undefined

		try {
			if (controller.signal.aborted) {
				throw new DOMException('Aborted', 'AbortError')
			}

			stream = await createFileTextStream(source, path, {
				chunkSize: DEFAULT_CHUNK_SIZE
			})

			if (controller.signal.aborted) {
				throw new DOMException('Aborted', 'AbortError')
			}

			const result = await stream.readNext()

			if (controller.signal.aborted) {
				throw new DOMException('Aborted', 'AbortError')
			}

			if (!result.done && result.chunk) {
				onChunk?.(result.chunk)
				return result.chunk
			}

			return ''
		} finally {
			await stream?.close().catch(() => undefined)
			if (streamControllers.get(path) === controller) {
				streamControllers.delete(path)
			}
		}
	})
}
