/**
 * File opener hook for the split editor panel.
 *
 * Encapsulates the logic for opening files as tabs: loading content,
 * handling errors, managing loading states, and preventing duplicate opens.
 */

import { toast } from '@repo/ui/toaster'
import { createFileContent } from '../../split-editor/types'
import { getDefaultSource } from '../config/constants'
import {
	classifyError,
	createFileTooLargeError,
	MAX_FILE_SIZE,
	getErrorTitle,
} from '../fileLoadingErrors'
import { loadFile } from '../FileLoadingService'
import type { PersistedLayoutManager } from '../../split-editor/createPersistedLayoutManager'
import type { FsState } from '../types'
import type { FsActions, FsInternalActions } from '../context/FsContext'
import type { DocumentCache } from '../cache/documentCache'

type FileOpenerDeps = {
	state: FsState
	actions: FsActions & FsInternalActions
	layoutManager: PersistedLayoutManager
	fileCache: DocumentCache
	onFileLoaded?: (filePath: string) => void
}

export type FileOpenerHandle = {
	/** Open a file as a tab, loading its content and registering it. */
	openFileAsTab: (filePath: string) => Promise<void>
	/**
	 * Preload file content from a persisted layout before restoring.
	 * Returns list of file paths that failed to load.
	 */
	preloadPersistedFileContent: () => Promise<string[]>
	/** Remove tabs for files that failed to load. */
	removeFailedTabs: (failedPaths: string[]) => void
}

export function useFileOpener(deps: FileOpenerDeps): FileOpenerHandle {
	const { state, actions, layoutManager, fileCache, onFileLoaded } = deps

	// Track files currently being opened to prevent race conditions
	const filesBeingOpened = new Set<string>()

	async function openFileAsTab(filePath: string): Promise<void> {
		const focusedPaneId = layoutManager.state.focusedPaneId
		if (!focusedPaneId) {
			// Clicking a file in the tree would otherwise do nothing at all here,
			// with no error to explain it.
			console.warn('[fs] cannot open file: no focused pane', { filePath })
			return
		}

		// Prevent duplicate opens while file is being loaded
		if (filesBeingOpened.has(filePath)) {
			console.warn('[fs] open ignored: already opening', { filePath })
			return
		}

		const existingTab = layoutManager.findTabByFilePath(filePath)
		if (existingTab) {
			layoutManager.setActiveTab(existingTab.paneId, existingTab.tab.id)
			layoutManager.setFocusedPane(existingTab.paneId)
			return
		}

		filesBeingOpened.add(filePath)

		const source = state.activeSource ?? getDefaultSource()

		// Pre-create the resource to track loading state
		actions.preloadFileContent(filePath, '')
		actions.setLoadingState(filePath, { status: 'loading' })

		// Create the tab first (shows loading indicator)
		const content = createFileContent(filePath)
		layoutManager.openTab(focusedPaneId, content)

		try {
			const result = await loadFile({
				source,
				path: filePath,
				fileCache,
				onSyntaxReady: (syntax) => {
					actions.setSyntax(filePath, syntax)
				},
			})

			// Check file size limit
			if (result.fileSize > MAX_FILE_SIZE) {
				const error = createFileTooLargeError(filePath, result.fileSize)
				actions.setLoadingError(filePath, error)
				toast.error(`${getErrorTitle(error.type)}: ${error.message}`)
				return
			}

			if (result.isBinary) {
				toast.warning(`${filePath.split('/').pop()} is a binary file`)
			}

			console.debug('[fs] loaded', {
				filePath,
				contentLen: result.content.length,
				fileSize: result.fileSize,
				fromCache: result.fromCache,
			})
			// Load content into resource manager
			actions.preloadFileContent(filePath, result.content)
			actions.setLoadingState(filePath, { status: 'loaded' })

			// Set saved content baseline for dirty tracking
			actions.setSavedContent(filePath, result.content)

			// Notify caller so it can register with sync
			onFileLoaded?.(filePath)
		} catch (error) {
			const fileError = classifyError(filePath, error)
			actions.setLoadingError(filePath, fileError)
			toast.error(`${getErrorTitle(fileError.type)}: ${fileError.message}`)
		} finally {
			filesBeingOpened.delete(filePath)
		}
	}

	async function preloadPersistedFileContent(): Promise<string[]> {
		const saved = layoutManager.getPersistedLayout()
		if (!saved) return []

		const source = state.activeSource ?? getDefaultSource()
		const failedPaths: string[] = []

		for (const node of saved.nodes) {
			if (node.type !== 'pane' || !node.tabs) continue

			for (const tab of node.tabs) {
				if (tab.content.type !== 'file' || !tab.content.filePath) continue
				const filePath = tab.content.filePath

				if (filePath === 'Untitled') {
					actions.preloadFileContent(filePath, '')
					continue
				}

				try {
					const result = await loadFile({
						source,
						path: filePath,
						fileCache,
						onSyntaxReady: (syntax) => {
							actions.setSyntax(filePath, syntax)
						},
					})

					actions.preloadFileContent(filePath, result.content)
					actions.setSavedContent(filePath, result.content)
				} catch {
					failedPaths.push(filePath)
				}
			}
		}

		return failedPaths
	}

	function removeFailedTabs(failedPaths: string[]): void {
		if (failedPaths.length === 0) return

		for (const filePath of failedPaths) {
			const found = layoutManager.findTabByFilePath(filePath)
			if (found) {
				try {
					layoutManager.closeTab(found.paneId, found.tab.id)
				} catch {
					// Ignore errors during cleanup
				}
			}
		}
	}

	return {
		openFileAsTab,
		preloadPersistedFileContent,
		removeFailedTabs,
	}
}
