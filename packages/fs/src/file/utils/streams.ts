import type { ReadableByteStream } from '../types'

export const textEncoder = new TextEncoder()

export function isReadableStream(value: unknown): value is ReadableByteStream {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as ReadableStream<unknown>).getReader === 'function'
	)
}

export function bufferSourceToUint8Array(source: BufferSource): Uint8Array {
	if (ArrayBuffer.isView(source)) {
		const view = source as ArrayBufferView
		return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
	}

	return new Uint8Array(source as ArrayBufferLike)
}

export function chunkByteLength(chunk: string | BufferSource): number {
	return typeof chunk === 'string'
		? textEncoder.encode(chunk).byteLength
		: bufferSourceToUint8Array(chunk).byteLength
}

export function writeToWritable(
	writable: FileSystemWritableFileStream,
	content: string | BufferSource | ReadableByteStream
): Promise<void> {
	if (isReadableStream(content)) {
		return writeStreamToWritable(writable, content)
	}

	return writable
		.write(content as FileSystemWriteChunkType)
		.then(() => undefined)
}

export async function writeStreamToWritable(
	writable: FileSystemWritableFileStream,
	stream: ReadableByteStream
): Promise<void> {
	const reader = stream.getReader()
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			if (!value) continue
			const chunk =
				value instanceof Uint8Array
					? value
					: bufferSourceToUint8Array(value as BufferSource)
			await writable.write(chunk as FileSystemWriteChunkType)
		}
	} catch (err) {
		try {
			await reader.cancel(err)
		} catch {}
		throw err
	} finally {
		reader.releaseLock()
	}
}
