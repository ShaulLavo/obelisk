/**
 * Chunk Reader
 *
 * Streams file content in chunks with overlap to handle
 * pattern matches that span chunk boundaries.
 */

import type { ChunkData } from './types'

/**
 * Default chunk size: 512KB
 * Tuned for good balance between memory usage and I/O efficiency.
 */
export const DEFAULT_CHUNK_SIZE = 512 * 1024

/**
 * Stream file contents in chunks with overlap for boundary matching.
 *
 * The overlap ensures patterns spanning chunk boundaries are found.
 * Overlap size should be at least (patternLength - 1) bytes.
 *
 * @param stream - ReadableStream from file.stream()
 * @param chunkSize - Target chunk size in bytes
 * @param overlapSize - Bytes to overlap between chunks
 * @yields ChunkData with raw bytes, absolute offset, and last-chunk flag
 *
 * @example
 * const file = await handle.getFile()
 * const stream = file.stream()
 * for await (const { chunk, absoluteOffset } of streamChunksWithOverlap(
 *   stream, 512 * 1024, pattern.length - 1
 * )) {
 *   // Process chunk...
 * }
 */
export async function* streamChunksWithOverlap(
	stream: ReadableStream<Uint8Array>,
	chunkSize: number,
	overlapSize: number
): AsyncGenerator<ChunkData> {
	const reader = stream.getReader()
	let buffer = new Uint8Array(0)
	let absoluteOffset = 0
	let isFirstChunk = true

	try {
		while (true) {
			const { done, value } = await reader.read()

			if (done) {
				// Yield remaining buffer as final chunk
				if (buffer.length > 0) {
					yield {
						chunk: buffer,
						absoluteOffset,
						isLast: true,
					}
				}
				break
			}

			// Append new data to buffer
			buffer = concatUint8Arrays(buffer, value)

			// Yield full chunks while we have enough data
			while (buffer.length >= chunkSize) {
				const chunk = buffer.slice(0, chunkSize)

				yield {
					chunk,
					absoluteOffset,
					isLast: false,
				}

				// Advance offset (accounting for overlap)
				// First chunk: no overlap needed at start
				const advance = isFirstChunk ? chunkSize : chunkSize - overlapSize
				absoluteOffset += advance
				buffer = buffer.slice(advance)
				isFirstChunk = false
			}
		}
	} finally {
		reader.releaseLock()
	}
}

/**
 * Read entire file into a single Uint8Array.
 * Use only for small files where streaming overhead isn't worth it.
 *
 * @param stream - ReadableStream from file.stream()
 * @returns Complete file contents as Uint8Array
 */
export async function readFullStream(
	stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
	const reader = stream.getReader()
	const chunks: Uint8Array[] = []

	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			chunks.push(value)
		}
	} finally {
		reader.releaseLock()
	}

	// Concatenate all chunks
	const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
	const result = new Uint8Array(totalLength)
	let offset = 0
	for (const chunk of chunks) {
		result.set(chunk, offset)
		offset += chunk.length
	}

	return result
}

/**
 * Concatenate two Uint8Arrays efficiently.
 */
function concatUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
	const result = new Uint8Array(a.length + b.length)
	result.set(a, 0)
	result.set(b, a.length)
	return result
}

/**
 * Calculate appropriate chunk size based on pattern length.
 * Ensures chunk is at least 4x pattern length for efficiency.
 */
export function calculateChunkSize(
	patternLength: number,
	preferredSize: number = DEFAULT_CHUNK_SIZE
): number {
	const minSize = patternLength * 4
	return Math.max(minSize, preferredSize)
}
