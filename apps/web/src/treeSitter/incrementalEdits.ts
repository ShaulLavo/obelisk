import type { DocumentIncrementalEdit } from '@repo/code-editor'
import { applyTreeSitterEdit } from './workerClient'
import { logger } from '../logger'

export const sendIncrementalTreeEdit = (
	path: string | undefined,
	edit: DocumentIncrementalEdit
) => {
	if (!path) return undefined
	const highlightPromise = applyTreeSitterEdit({
		path,
		startIndex: edit.startIndex,
		oldEndIndex: edit.oldEndIndex,
		newEndIndex: edit.newEndIndex,
		startPosition: edit.startPosition,
		oldEndPosition: edit.oldEndPosition,
		newEndPosition: edit.newEndPosition,
		insertedText: edit.insertedText
	})
	return highlightPromise.catch(error => {
		logger.withTag('treeSitter').error('[Tree-sitter worker] incremental edit failed', error)
		return undefined
	})
}
