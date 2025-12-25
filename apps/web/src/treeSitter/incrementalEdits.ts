import type { DocumentIncrementalEdit } from '@repo/code-editor'
import type {
	TreeSitterParseResult,
	TreeSitterEditPayload,
} from '../workers/treeSitterWorkerTypes'
import { applyTreeSitterEditBatch } from './workerClient'
import { logger } from '../logger'

const log = logger.withTag('treeSitter')
const assert = (
	condition: boolean,
	message: string,
	details?: Record<string, unknown>
) => {
	if (condition) return true
	log.warn(message, details)
	return false
}

/**
 * Small debounce delay to batch rapid keystrokes.
 * This prevents overwhelming the tree-sitter worker with parse requests
 * while the user is actively typing.
 */
const DEBOUNCE_MS = 50

let debounceTimeout: ReturnType<typeof setTimeout> | null = null
let pendingEdits: {
	path: string
	edits: Omit<TreeSitterEditPayload, 'path'>[]
} | null = null
let pendingResolve:
	| ((result: TreeSitterParseResult | undefined) => void)
	| null = null
let currentRequestId = 0
let pendingBatchStartedAt = 0
let pendingBatchId = 0

/**
 * Sends an incremental tree-sitter edit with debouncing and batching.
 *
 * - Accumulates rapid edits into a batch during the debounce window
 * - Sends the entire batch to tree-sitter for sequential processing
 * - Returns a promise that resolves with parse results (or undefined if cancelled/failed)
 */
export const sendIncrementalTreeEdit = (
	path: string | undefined,
	edit: DocumentIncrementalEdit
): Promise<TreeSitterParseResult | undefined> | undefined => {
	if (!path) return undefined

	const editPayload: Omit<TreeSitterEditPayload, 'path'> = {
		startIndex: edit.startIndex,
		oldEndIndex: edit.oldEndIndex,
		newEndIndex: edit.newEndIndex,
		startPosition: edit.startPosition,
		oldEndPosition: edit.oldEndPosition,
		newEndPosition: edit.newEndPosition,
		insertedText: edit.insertedText,
	}
	const expectedNewEnd = edit.startIndex + edit.insertedText.length
	assert(
		Number.isFinite(edit.startIndex) &&
			Number.isFinite(edit.oldEndIndex) &&
			Number.isFinite(edit.newEndIndex) &&
			edit.oldEndIndex >= edit.startIndex &&
			edit.newEndIndex >= edit.startIndex,
		'Invalid incremental edit payload',
		{ path, edit }
	)
	if (edit.newEndIndex !== expectedNewEnd) {
		log.warn('Incremental edit new end mismatch', {
			path,
			edit,
			expectedNewEnd,
		})
	}

	// If there's an existing pending batch for a different path, flush it
	if (pendingEdits && pendingEdits.path !== path) {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout)
			debounceTimeout = null
		}
		log.debug('Tree-sitter batch flushed for new path', {
			fromPath: pendingEdits.path,
			toPath: path,
			editCount: pendingEdits.edits.length,
		})
		pendingResolve?.(undefined)
		pendingEdits = null
		pendingResolve = null
	}

	// Add to existing batch or create new batch
	if (pendingEdits && pendingEdits.path === path) {
		pendingEdits.edits.push(editPayload)
	} else {
		pendingEdits = { path, edits: [editPayload] }
		pendingBatchStartedAt = performance.now()
		pendingBatchId += 1
	}

	// Reset the debounce timer
	if (debounceTimeout) {
		clearTimeout(debounceTimeout)
	}

	return new Promise((resolve) => {
		// Replace the pending resolve - only the final caller gets the result
		if (pendingResolve) {
			pendingResolve(undefined)
		}
		pendingResolve = resolve

		debounceTimeout = setTimeout(() => {
			debounceTimeout = null
			const batch = pendingEdits!
			pendingEdits = null
			pendingResolve = null

			const batchStartedAt = pendingBatchStartedAt || performance.now()
			const batchId = pendingBatchId
			const editCount = batch.edits.length
			assert(editCount > 0, 'Tree-sitter batch missing edits', {
				path: batch.path,
				batchId,
			})

			// Increment request ID to track this specific request
			const requestId = ++currentRequestId
			const requestStartedAt = performance.now()

			applyTreeSitterEditBatch(batch.path, batch.edits)
				.then((result) => {
					const workerDuration = performance.now() - requestStartedAt
					const totalDuration = performance.now() - batchStartedAt
					if (totalDuration >= 200 || workerDuration >= 100) {
						log.debug('Tree-sitter batch completed', {
							path: batch.path,
							editCount,
							batchId,
							debounceMs: DEBOUNCE_MS,
							queuedMs: Math.max(0, requestStartedAt - batchStartedAt),
							workerMs: workerDuration,
							totalMs: totalDuration,
						})
					}
					// Only resolve if this is still the latest request
					if (requestId === currentRequestId) {
						resolve(result)
					} else {
						log.debug('Tree-sitter batch superseded', {
							path: batch.path,
							editCount,
							batchId,
						})
						// Request was superseded, resolve with undefined
						resolve(undefined)
					}
				})
				.catch((error) => {
					log.error('[Tree-sitter worker] incremental edit batch failed', error)
					resolve(undefined)
				})
		}, DEBOUNCE_MS)
	})
}

/**
 * Clears any pending debounced tree-sitter edit.
 * Useful when switching files or cleaning up.
 */
export const clearPendingTreeEdit = () => {
	if (debounceTimeout) {
		clearTimeout(debounceTimeout)
		debounceTimeout = null
	}
	pendingEdits = null
	pendingResolve?.(undefined)
	pendingResolve = null
	// Increment request ID to invalidate any in-flight requests
	currentRequestId++
}
