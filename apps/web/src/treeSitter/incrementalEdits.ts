import type { DocumentIncrementalEdit } from '@repo/code-editor'
import type {
	TreeSitterParseResult,
	TreeSitterEditPayload,
} from '../workers/treeSitter/types'
import { applyTreeSitterEditBatch } from './workerClient'
import { logger } from '../logger'

const log = logger.withTag('treeSitter')

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

	if (pendingEdits && pendingEdits.path === path) {
		pendingEdits.edits.push(editPayload)
	} else {
		pendingEdits = { path, edits: [editPayload] }
		pendingBatchStartedAt = performance.now()
		pendingBatchId += 1
	}

	if (debounceTimeout) {
		clearTimeout(debounceTimeout)
	}

	return new Promise((resolve) => {
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

					if (requestId === currentRequestId) {
						resolve(result)
					} else {
						log.debug('Tree-sitter batch superseded', {
							path: batch.path,
							editCount,
							batchId,
						})
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

export const clearPendingTreeEdit = () => {
	if (debounceTimeout) {
		clearTimeout(debounceTimeout)
		debounceTimeout = null
	}
	pendingEdits = null
	pendingResolve?.(undefined)
	pendingResolve = null

	currentRequestId++
}
