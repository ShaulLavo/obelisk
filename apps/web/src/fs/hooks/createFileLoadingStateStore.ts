/**
 * File Loading State Store
 *
 * Manages loading status, errors, and line starts per file.
 * Used by split editor for multi-file loading state.
 */

import { createStore, reconcile } from 'solid-js/store'
import { createFilePath } from '@repo/fs'
import type { FileLoadingError, FileLoadingStatus } from '../../split-editor/fileLoadingErrors'

export const createFileLoadingStateStore = () => {
	const [fileLoadingStatus, setStatusStore] = createStore<
		Record<string, FileLoadingStatus>
	>({})

	const [fileLoadingErrors, setErrorsStore] = createStore<
		Record<string, FileLoadingError | null>
	>({})

	const [fileLineStarts, setLineStartsStore] = createStore<
		Record<string, number[]>
	>({})

	const setFileLoadingStatus = (path: string, status: FileLoadingStatus) => {
		if (!path) return
		const p = createFilePath(path)
		setStatusStore(p, status)
	}

	const setFileLoadingError = (path: string, error: FileLoadingError | null) => {
		if (!path) return
		const p = createFilePath(path)
		setErrorsStore(p, error)
		if (error) {
			setStatusStore(p, 'error')
		}
	}

	const setFileLineStarts = (path: string, lineStarts: number[]) => {
		if (!path) return
		const p = createFilePath(path)
		setLineStartsStore(p, lineStarts)
	}

	/** Build line starts from content string */
	const buildLineStartsFromText = (text: string): number[] => {
		const starts: number[] = [0]
		let index = text.indexOf('\n')
		while (index !== -1) {
			starts.push(index + 1)
			index = text.indexOf('\n', index + 1)
		}
		return starts
	}

	/** Preload file content - sets status to loaded and computes line starts */
	const preloadFileContent = (path: string, content: string) => {
		if (!path) return
		const p = createFilePath(path)
		setStatusStore(p, 'loaded')
		setLineStartsStore(p, buildLineStartsFromText(content))
	}

	const clearFileLoadingState = (path: string) => {
		if (!path) return
		const p = createFilePath(path)
		setStatusStore(p, undefined as unknown as FileLoadingStatus)
		setErrorsStore(p, undefined as unknown as null)
		setLineStartsStore(p, undefined as unknown as number[])
	}

	const clearAllFileLoadingState = () => {
		setStatusStore(reconcile({}))
		setErrorsStore(reconcile({}))
		setLineStartsStore(reconcile({}))
	}

	return {
		fileLoadingStatus,
		fileLoadingErrors,
		fileLineStarts,
		setFileLoadingStatus,
		setFileLoadingError,
		setFileLineStarts,
		preloadFileContent,
		clearFileLoadingState,
		clearAllFileLoadingState,
	}
}
