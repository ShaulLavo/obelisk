/**
 * Browser Grep
 *
 * High-performance, streaming, byte-level grep for the browser.
 * Built on VFS for directory traversal and caching.
 *
 * Features:
 * - Literal pattern matching (no regex)
 * - Streaming byte-level search (no full file decode)
 * - Chunk overlap for boundary matching
 * - Worker pool for parallel processing
 * - VFS directory cache integration
 *
 * @example
 * import { grep, createFs, getRootDirectory } from '@repo/fs'
 *
 * const root = await getRootDirectory('user')
 * const fs = createFs(root)
 *
 * // Simple search
 * const matches = await grep(fs, 'TODO')
 *
 * // With options
 * const matches = await grep(fs, 'console.log', {
 *   paths: ['src'],
 *   excludePatterns: ['node_modules'],
 *   maxResults: 100
 * })
 *
 * // With progress
 * const matches = await grep(fs, 'function', {}, (progress) => {
 *   console.log(`${progress.filesScanned}/${progress.filesTotal} files`)
 * })
 */

// Types
export type {
	GrepOptions,
	GrepMatch,
	GrepFileResult,
	GrepProgress,
	GrepProgressCallback,
	GrepFileTask,
	LineInfo,
	ChunkData,
} from './types'

// Coordinator
export { GrepCoordinator } from './GrepCoordinator'

// Utilities (for advanced usage or testing)
export {
	findPatternInChunk,
	hasPattern,
	countByte,
	findByteBackward,
	findByteForward,
} from './byteSearch'

export { extractLine, isBinaryChunk, trimLine } from './lineExtractor'

export {
	streamChunksWithOverlap,
	readFullStream,
	calculateChunkSize,
	DEFAULT_CHUNK_SIZE,
} from './chunkReader'

// ============================================================================
// Convenience API
// ============================================================================

import { GrepCoordinator } from './GrepCoordinator'
import type { FsContext } from '../vfs/types'
import type { GrepOptions, GrepMatch, GrepProgressCallback } from './types'

/**
 * Simple grep function for one-off searches.
 *
 * For repeated searches in the same session, create a GrepCoordinator
 * directly to reuse the worker pool.
 *
 * @param fs - VFS context
 * @param pattern - Literal string to search for
 * @param options - Search options (paths, filters, limits)
 * @param onProgress - Optional progress callback
 * @returns Array of all matches found
 *
 * @example
 * const matches = await grep(fs, 'TODO', { paths: ['src'] })
 */
export async function grep(
	fs: FsContext,
	pattern: string,
	options?: Omit<GrepOptions, 'pattern'>,
	onProgress?: GrepProgressCallback
): Promise<GrepMatch[]> {
	const coordinator = new GrepCoordinator(fs)

	try {
		return await coordinator.grep({ ...options, pattern }, onProgress)
	} finally {
		coordinator.terminate()
	}
}

/**
 * Streaming grep that yields results as they're found.
 *
 * Use when you want to display results progressively.
 *
 * @example
 * for await (const result of grepStream(fs, 'TODO')) {
 *   console.log(`Found ${result.matches.length} in ${result.path}`)
 * }
 */
export async function* grepStream(
	fs: FsContext,
	pattern: string,
	options?: Omit<GrepOptions, 'pattern'>
) {
	const coordinator = new GrepCoordinator(fs)

	try {
		yield* coordinator.grepStream({ ...options, pattern })
	} finally {
		coordinator.terminate()
	}
}
