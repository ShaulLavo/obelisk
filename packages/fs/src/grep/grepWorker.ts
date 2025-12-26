/**
 * Grep Worker
 *
 * Runs in a Web Worker to perform streaming grep on files
 * without blocking the main thread.
 */

import { expose } from 'comlink'
import { findPatternInChunk, countByte } from './byteSearch'
import { streamChunksWithOverlap } from './chunkReader'
import { extractLine, isBinaryChunk } from './lineExtractor'
import type { GrepFileTask, GrepFileResult, GrepMatch } from './types'

const NEWLINE = 0x0a

/**
 * Grep a single file using streaming byte search.
 *
 * @param task - File task containing handle, path, and pattern
 * @returns Result with matches and stats
 */
async function grepFile(task: GrepFileTask): Promise<GrepFileResult> {
	const { fileHandle, path, patternBytes, chunkSize } = task
	const matches: GrepMatch[] = []
	let bytesScanned = 0

	try {
		const file = await fileHandle.getFile()

		// Skip empty files
		if (file.size === 0) {
			return { path, matches, bytesScanned: 0 }
		}

		const stream = file.stream()
		const overlapSize = Math.max(0, patternBytes.length - 1)
		const effectiveChunkSize = Math.max(chunkSize, patternBytes.length * 4)

		let isFirstChunk = true
		let prevChunkLineCount = 0

		for await (const {
			chunk,
			// absoluteOffset is available if needed for future features
			isLast,
		} of streamChunksWithOverlap(stream, effectiveChunkSize, overlapSize)) {
			// Optional: Skip binary files (check first chunk only)
			if (isFirstChunk && isBinaryChunk(chunk)) {
				return { path, matches, bytesScanned: chunk.length, error: 'binary' }
			}
			isFirstChunk = false

			bytesScanned += chunk.length

			// Find all pattern occurrences in this chunk
			const offsets = findPatternInChunk(chunk, patternBytes)

			// Extract line info for each match
			for (const offset of offsets) {
				const lineInfo = extractLine(chunk, offset, prevChunkLineCount)

				matches.push({
					path,
					lineNumber: lineInfo.lineNumber,
					lineContent: lineInfo.lineContent.trim(),
					matchStart: lineInfo.columnOffset,
				})
			}

			// Update line count for next chunk
			// For overlapping chunks, we need to count lines in the non-overlapping portion
			if (!isLast) {
				const countEnd = chunk.length - overlapSize
				prevChunkLineCount += countByte(chunk, NEWLINE, 0, countEnd)
			}
		}

		return { path, matches, bytesScanned }
	} catch (error) {
		return {
			path,
			matches: [],
			bytesScanned,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

/**
 * Grep a batch of files.
 * Workers receive batches to reduce message overhead.
 *
 * @param tasks - Array of file tasks
 * @returns Array of results
 */
async function grepBatch(tasks: GrepFileTask[]): Promise<GrepFileResult[]> {
	const results: GrepFileResult[] = []

	for (const task of tasks) {
		const result = await grepFile(task)
		results.push(result)
	}

	return results
}

/**
 * Grep files in parallel within the worker.
 * Use when files are small and parallelism helps.
 */
async function grepBatchParallel(
	tasks: GrepFileTask[]
): Promise<GrepFileResult[]> {
	return Promise.all(tasks.map(grepFile))
}

// Worker API exposed via Comlink
export const workerApi = {
	grepFile,
	grepBatch,
	grepBatchParallel,
}

export type GrepWorkerApi = typeof workerApi

expose(workerApi)
