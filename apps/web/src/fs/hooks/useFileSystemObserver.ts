import {
	createFileSystemObserver,
	type FileSystemChangeRecord,
	type FileSystemObserverPolyfill,
} from '@repo/fs'
import { loggers } from '@repo/logger'
import { onCleanup } from 'solid-js'
import { findNode } from '../runtime/tree'
import type { FsState } from '../types'

type UseFileSystemObserverOptions = {
	state: FsState
	/** Reload a specific file path from disk */
	reloadFile: (path: string) => Promise<void>
	/** Reload a specific directory path from disk */
	reloadDirectory: (path: string) => Promise<void>
	/** Check if a file has unsaved local edits */
	hasLocalEdits: (path: string) => boolean
	/** Get the root directory handle for observation */
	getRootHandle: () => FileSystemDirectoryHandle | undefined
	/** Polling interval in ms (default 1000) */
	pollIntervalMs?: number
}

/**
 * Hook to observe file system changes and sync with application state.
 *
 * Handles:
 * - `appeared`: New file/folder created → reload parent directory
 * - `disappeared`: File/folder deleted → reload parent directory
 * - `modified`: File content changed → reload file (if no local edits)
 * - `errored`: Observation failed → log and continue
 */
export const useFileSystemObserver = ({
	state,
	reloadFile,
	reloadDirectory,
	hasLocalEdits,
	getRootHandle,
	pollIntervalMs = 1000,
}: UseFileSystemObserverOptions) => {
	let observer: FileSystemObserverPolyfill | null = null
	let isObserving = false

	const getParentPath = (path: string): string => {
		const segments = path.split('/').filter(Boolean)
		segments.pop()
		return segments.join('/')
	}

	const handleChangeRecords = async (records: FileSystemChangeRecord[]) => {
		const processedPaths = new Set<string>()

		for (const record of records) {
			const fullPath = record.relativePathComponents.join('/')

			// Skip if we already processed this path in this batch
			if (processedPaths.has(fullPath)) continue

			loggers.fs.debug('[FileSystemObserver] Change detected:', {
				type: record.type,
				path: fullPath,
			})

			// switch (record.type) {
			// 	case 'appeared': {
			// 		// New file or folder appeared - reload parent directory
			// 		const parentPath = getParentPath(fullPath)
			// 		if (!processedPaths.has(parentPath)) {
			// 			processedPaths.add(parentPath)
			// 			try {
			// 				await reloadDirectory(parentPath)
			// 			} catch (error) {
			// 				loggers.fs.error(
			// 					'[FileSystemObserver] Failed to reload directory after appear:',
			// 					parentPath,
			// 					error
			// 				)
			// 			}
			// 		}
			// 		break
			// 	}

			// 	case 'disappeared': {
			// 		// File or folder was deleted - reload parent directory
			// 		const parentPath = getParentPath(fullPath)
			// 		if (!processedPaths.has(parentPath)) {
			// 			processedPaths.add(parentPath)
			// 			try {
			// 				await reloadDirectory(parentPath)
			// 			} catch (error) {
			// 				loggers.fs.error(
			// 					'[FileSystemObserver] Failed to reload directory after disappear:',
			// 					parentPath,
			// 					error
			// 				)
			// 			}
			// 		}
			// 		break
			// 	}

			// 	case 'modified': {
			// 		// File content changed - check if it's the currently selected file
			// 		const node = state.tree ? findNode(state.tree, fullPath) : undefined

			// 		if (node?.kind === 'file') {
			// 			// TODO: Handle case where user has local edits
			// 			// For now, we skip reloading if there are unsaved changes
			// 			if (hasLocalEdits(fullPath)) {
			// 				loggers.fs.debug(
			// 					'[FileSystemObserver] Skipping reload - file has local edits:',
			// 					fullPath
			// 				)
			// 				// TODO: Show a notification to user that file changed on disk
			// 				// TODO: Offer merge/reload/keep options
			// 				continue
			// 			}

			// 			processedPaths.add(fullPath)
			// 			try {
			// 				await reloadFile(fullPath)
			// 			} catch (error) {
			// 				loggers.fs.error(
			// 					'[FileSystemObserver] Failed to reload modified file:',
			// 					fullPath,
			// 					error
			// 				)
			// 			}
			// 		}
			// 		break
			// 	}

			// 	case 'moved': {
			// 		// File/folder was moved within the watched scope
			// 		// Reload both the old and new parent directories
			// 		const newParentPath = getParentPath(fullPath)
			// 		const oldPath = record.relativePathMovedFrom?.join('/')
			// 		const oldParentPath = oldPath ? getParentPath(oldPath) : undefined

			// 		if (!processedPaths.has(newParentPath)) {
			// 			processedPaths.add(newParentPath)
			// 			try {
			// 				await reloadDirectory(newParentPath)
			// 			} catch (error) {
			// 				loggers.fs.error(
			// 					'[FileSystemObserver] Failed to reload directory after move (new):',
			// 					newParentPath,
			// 					error
			// 				)
			// 			}
			// 		}

			// 		if (oldParentPath && !processedPaths.has(oldParentPath)) {
			// 			processedPaths.add(oldParentPath)
			// 			try {
			// 				await reloadDirectory(oldParentPath)
			// 			} catch (error) {
			// 				loggers.fs.error(
			// 					'[FileSystemObserver] Failed to reload directory after move (old):',
			// 					oldParentPath,
			// 					error
			// 				)
			// 			}
			// 		}
			// 		break
			// 	}

			// 	case 'errored': {
			// 		loggers.fs.warn(
			// 			'[FileSystemObserver] Observation error occurred:',
			// 			fullPath
			// 		)
			// 		break
			// 	}

			// 	case 'unknown': {
			// 		// Events may have been missed - do a full refresh of the root
			// 		loggers.fs.warn(
			// 			'[FileSystemObserver] Unknown events - consider full refresh'
			// 		)
			// 		break
			// 	}
			// }
		}
	}

	const startObserving = async () => {
		const rootHandle = getRootHandle()
		if (!rootHandle) {
			loggers.fs.debug('[FileSystemObserver] No root handle available')
			return
		}

		if (isObserving) {
			loggers.fs.debug('[FileSystemObserver] Already observing')
			return
		}

		observer = createFileSystemObserver((records) => {
			void handleChangeRecords(records)
		}, pollIntervalMs)

		try {
			await observer.observe(rootHandle, { recursive: true })
			isObserving = true
			loggers.fs.info(
				'[FileSystemObserver] Started observing filesystem',
				observer.isNative ? '(native)' : '(polling)'
			)
		} catch (error) {
			loggers.fs.error('[FileSystemObserver] Failed to start observing:', error)
		}
	}

	const stopObserving = () => {
		if (observer) {
			observer.disconnect()
			observer = null
			isObserving = false
			loggers.fs.debug('[FileSystemObserver] Stopped observing')
		}
	}

	// Cleanup on component unmount
	onCleanup(() => {
		stopObserving()
	})

	return {
		startObserving,
		stopObserving,
		get isObserving() {
			return isObserving
		},
	}
}
