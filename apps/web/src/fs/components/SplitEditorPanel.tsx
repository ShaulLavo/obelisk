/**
 * Split Editor Panel
 *
 * Replaces the single editor with a split editor system.
 * Integrates with the existing file system context and provides
 * tab-based editing with split panes.
 *
 * Requirements: 5.3, 5.4, 5.5 - Error handling, file type detection, large files
 */

import { onMount, onCleanup, type Accessor, type JSX } from 'solid-js'
import { toast } from '@repo/ui/toaster'
import { SplitEditor } from '../../split-editor/components/SplitEditor'
import { FileTab } from '../../split-editor/components/FileTab'
import { createPersistedLayoutManager } from '../../split-editor/createPersistedLayoutManager'
import { createResourceManager } from '../../split-editor/createResourceManager'
import { createFileContent, isPane } from '../../split-editor/types'
import { EditorInstanceAdapter } from '../../split-editor/EditorInstanceAdapter'
import { useFs } from '../context/FsContext'
import { ActiveFileProvider } from '../context/ActiveFileContext'
import { readFileText, getFileSize } from '../runtime/streaming'
import { ensureFs } from '../runtime/fsRuntime'
import { DEFAULT_SOURCE } from '../config/constants'
import type { Tab, EditorPane, LayoutManager } from '../../split-editor'
import {
	classifyError,
	isBinaryExtension,
	isBinaryContent,
	createFileTooLargeError,
	MAX_FILE_SIZE,
	getErrorTitle,
} from '../../split-editor/fileLoadingErrors'
import {
	EditorFileSyncManager,
	EditorRegistryImpl,
	DEFAULT_EDITOR_SYNC_CONFIG,
	type NotificationSystem,
} from '@repo/code-editor/sync'
import { FileSyncManager } from '@repo/fs'

type SplitEditorPanelProps = {
	isFileSelected: Accessor<boolean>
	currentPath?: string
	onLayoutManagerReady?: (layoutManager: LayoutManager) => void
	onSyncManagerReady?: (syncManager: EditorFileSyncManager) => void
}

export const SplitEditorPanel = (props: SplitEditorPanelProps) => {
	const [state, actions] = useFs()
	const { fileCache } = actions

	// Editor registry for tracking open editors
	const editorRegistry = new EditorRegistryImpl()

	// Adapters for each open file (keyed by file path)
	const editorAdapters = new Map<string, EditorInstanceAdapter>()

	// Sync managers (initialized async in onMount)
	let fileSyncManager: FileSyncManager | null = null
	let editorSyncManager: EditorFileSyncManager | null = null

	// Notification system that uses toast
	const notificationSystem: NotificationSystem = {
		showNotification: (
			message: string,
			type: 'info' | 'warning' | 'error' = 'info'
		) => {
			if (type === 'error') toast.error(message)
			else if (type === 'warning') toast.warning(message)
			else toast.info(message)
		},
	}

	// Create resource manager first (needed for layout manager callback)
	// Pass callback to persist highlights when tree-sitter parsing completes
	const resourceManager = createResourceManager({
		onHighlightsUpdate: (filePath, data) => {
			// Persist highlights to IndexedDB for instant loading on next visit
			fileCache.set(filePath, {
				highlights: data.captures,
				brackets: data.brackets,
				folds: data.folds,
				errors: data.errors,
			})
		},
	})

	// Create persisted layout manager with tab close callback for resource cleanup
	const layoutManager = createPersistedLayoutManager({
		onTabClose: (_paneId, closedTab) => {
			// Only cleanup file resources, not empty tabs
			if (closedTab.content.type !== 'file' || !closedTab.content.filePath) {
				return
			}

			const filePath = closedTab.content.filePath

			// Check if any other tabs still have this file open
			const remainingTab = layoutManager.findTabByFilePath(filePath)
			if (!remainingTab) {
				resourceManager.cleanupFileResources(filePath)

				// Clean up sync integration
				const adapter = editorAdapters.get(filePath)
				if (adapter) {
					adapter.dispose()
					editorAdapters.delete(filePath)
				}
				editorRegistry.unregisterEditor(filePath)
			}
		},
	})

	/**
	 * Preload file content from persisted layout BEFORE restoring.
	 * Returns list of file paths that failed to load (for later removal).
	 */
	const preloadPersistedFileContent = async (): Promise<string[]> => {
		const saved = layoutManager.getPersistedLayout()
		if (!saved) return []

		const source = state.activeSource ?? DEFAULT_SOURCE
		const failedPaths: string[] = []

		for (const node of saved.nodes) {
			if (node.type !== 'pane' || !node.tabs) continue

			for (const tab of node.tabs) {
				if (tab.content.type !== 'file' || !tab.content.filePath) continue
				const filePath = tab.content.filePath

				if (filePath === 'Untitled') {
					resourceManager.preloadFileContent(filePath, '')
					continue
				}

				try {
					const content = await readFileText(source, filePath)

					resourceManager.preloadFileContent(filePath, content)

					// Hydrate cached highlights from file cache (IndexedDB)
					// This provides instant highlighting on tab switch
					const cachedEntry = await fileCache.getAsync(filePath)
					if (
						cachedEntry.highlights ||
						cachedEntry.brackets ||
						cachedEntry.folds ||
						cachedEntry.errors
					) {
						// 						console.log('[SplitEditorPanel] Hydrating cached highlights for', filePath, {
						// 							highlights: cachedEntry.highlights?.length ?? 0,
						// 							brackets: cachedEntry.brackets?.length ?? 0,
						// 							folds: cachedEntry.folds?.length ?? 0,
						// 							errors: cachedEntry.errors?.length ?? 0,
						// 						})
						resourceManager.hydrateCachedHighlights(filePath, {
							captures: cachedEntry.highlights,
							brackets: cachedEntry.brackets,
							folds: cachedEntry.folds,
							errors: cachedEntry.errors,
						})
					}
				} catch (error) {
					// 					console.warn(
					// 						`[SplitEditorPanel] Failed to preload: ${filePath}`,
					// 						error
					// 					)
					failedPaths.push(filePath)
				}
			}
		}

		return failedPaths
	}

	/**
	 * Remove tabs for files that failed to load.
	 */
	const removeFailedTabs = (failedPaths: string[]) => {
		if (failedPaths.length === 0) return

		for (const filePath of failedPaths) {
			const found = layoutManager.findTabByFilePath(filePath)
			if (found) {
				try {
					layoutManager.closeTab(found.paneId, found.tab.id)
					// 					console.log('[SplitEditorPanel] Error removing tab:', e)
				} catch {
					// Ignore errors during cleanup
				}
			}
		}
	}

	// Initialize with persistence support
	onMount(async () => {
		// IMPORTANT: Preload file content BEFORE initializing layout
		// This ensures buffers exist when FileTab components render
		const failedPaths = await preloadPersistedFileContent()

		layoutManager.initialize()

		removeFailedTabs(failedPaths)

		// If no tabs after restoration (or fresh start), open an untitled file
		const hasTabs = Object.values(layoutManager.state.nodes).some(
			(node) => isPane(node) && (node as EditorPane).tabs.length > 0
		)

		if (!hasTabs) {
			const focusedPaneId = layoutManager.state.focusedPaneId

			if (focusedPaneId) {
				const untitledPath = 'Untitled'
				resourceManager.preloadFileContent(untitledPath, '')
				const content = createFileContent(untitledPath)
				layoutManager.openTab(focusedPaneId, content)
			}
		}

		// Initialize file sync managers
		try {
			const source = state.activeSource ?? DEFAULT_SOURCE
			const fsContext = await ensureFs(source)

			fileSyncManager = new FileSyncManager({ fs: fsContext })
			editorSyncManager = new EditorFileSyncManager({
				syncManager: fileSyncManager,
				config: DEFAULT_EDITOR_SYNC_CONFIG,
				editorRegistry,
				notificationSystem,
			})

			// Start observing file system for external changes
			// 			// TODO: Method startObserving does not exist on FileSyncManager
			// 			// await fileSyncManager.startObserving()

			// Register already-open files with the sync manager
			for (const [path, tab] of getAllOpenFileTabs()) {
				if (path !== 'Untitled') {
					await registerFileWithSync(path)
				}
			}

			// Subscribe to dirty state changes and propagate to adapters
			const unsubDirtyChange = layoutManager.onTabDirtyChange(
				(paneId, tabId, isDirty) => {
					const pane = layoutManager.state.nodes[paneId]
					if (!pane || !isPane(pane)) return

					const editorPaneNode = pane as EditorPane
					const tab = editorPaneNode.tabs.find((t) => t.id === tabId)
					if (!tab || tab.content.type !== 'file' || !tab.content.filePath)
						return

					const filePath = tab.content.filePath
					const adapter = editorAdapters.get(filePath)
					if (adapter) {
						adapter.notifyDirtyChange(isDirty)
					}
				}
			)

			// Clean up subscription on unmount
			onCleanup(() => {
				unsubDirtyChange()
			})

			// Notify parent that sync manager is ready
			props.onSyncManagerReady?.(editorSyncManager)
			// 			console.error('[SplitEditorPanel] Failed to initialize sync managers:', error)
		} catch {
			// Ignore initialization errors
		}

		// Notify parent that layout manager is ready
		props.onLayoutManagerReady?.(layoutManager)
	})

	// Cleanup on unmount
	onCleanup(() => {
		// Dispose all adapters
		for (const adapter of editorAdapters.values()) {
			adapter.dispose()
		}
		editorAdapters.clear()

		// Dispose registry and sync managers
		editorRegistry.dispose()
		editorSyncManager?.dispose()
		// 		// TODO: Method stopObserving does not exist on FileSyncManager
		// 		// fileSyncManager?.stopObserving()
	})

	/**
	 * Get all open file tabs across all panes.
	 */
	function getAllOpenFileTabs(): [string, Tab][] {
		const result: [string, Tab][] = []
		for (const node of Object.values(layoutManager.state.nodes)) {
			if (isPane(node)) {
				const pane = node as EditorPane
				for (const tab of pane.tabs) {
					if (tab.content.type === 'file' && tab.content.filePath) {
						result.push([tab.content.filePath, tab])
					}
				}
			}
		}
		return result
	}

	/**
	 * Register a file with the sync system.
	 */
	async function registerFileWithSync(filePath: string): Promise<void> {
		if (!editorSyncManager || filePath === 'Untitled') return

		const buffer = resourceManager.getBuffer(filePath)
		if (!buffer) return

		// Create adapter if not exists
		if (!editorAdapters.has(filePath)) {
			const adapter = new EditorInstanceAdapter({
				filePath,
				buffer,
				layoutManager,
				findTab: () => layoutManager.findTabByFilePath(filePath),
				getTabDirty: () => {
					const found = layoutManager.findTabByFilePath(filePath)
					return found?.tab.isDirty ?? false
				},
				setTabDirty: (dirty: boolean) => {
					const found = layoutManager.findTabByFilePath(filePath)
					if (found) {
						layoutManager.setTabDirty(found.paneId, found.tab.id, dirty)
					}
				},
			})
			editorAdapters.set(filePath, adapter)
			editorRegistry.registerEditor(filePath, adapter)
		}
	}

	// Track files currently being opened to prevent race conditions
	const filesBeingOpened = new Set<string>()

	const openFileAsTab = async (filePath: string) => {
		const focusedPaneId = layoutManager.state.focusedPaneId
		if (!focusedPaneId) return

		// Prevent duplicate opens while file is being loaded
		if (filesBeingOpened.has(filePath)) {
			return
		}

		const existingTab = layoutManager.findTabByFilePath(filePath)
		if (existingTab) {
			layoutManager.setActiveTab(existingTab.paneId, existingTab.tab.id)
			layoutManager.setFocusedPane(existingTab.paneId)
			return
		}

		filesBeingOpened.add(filePath)

		const source = state.activeSource ?? DEFAULT_SOURCE

		// Pre-create the resource to track loading state
		resourceManager.preloadFileContent(filePath, '')
		resourceManager.setFileLoadingStatus(filePath, 'loading')

		// Create the tab first (shows loading indicator)
		const content = createFileContent(filePath)
		layoutManager.openTab(focusedPaneId, content)

		// Check if it's a known binary file type (we still load the content)
		const isBinaryByExtension = isBinaryExtension(filePath)

		try {
			// Check file size first
			const fileSize = await getFileSize(source, filePath)
			resourceManager.setFileMetadata(filePath, { size: fileSize })

			if (fileSize > MAX_FILE_SIZE) {
				const error = createFileTooLargeError(filePath, fileSize)
				resourceManager.setFileError(filePath, error)
				toast.error(`${getErrorTitle(error.type)}: ${error.message}`)
				return
			}

			// Read the file content
			const fileContent = await readFileText(source, filePath)

			// Check if content appears to be binary (or we already know from extension)
			const encoder = new TextEncoder()
			const buffer = encoder.encode(fileContent).buffer
			const isBinaryByContent = isBinaryContent(buffer)
			const isBinary = isBinaryByExtension || isBinaryByContent

			if (isBinary) {
				resourceManager.setFileMetadata(filePath, { isBinary: true })
				toast.warning(`${filePath.split('/').pop()} is a binary file`)
			}

			// Always load the content (even for binary files, to allow viewing as text)
			resourceManager.preloadFileContent(filePath, fileContent)
			resourceManager.setFileLoadingStatus(filePath, 'loaded')

			// Hydrate cached highlights from file cache (IndexedDB)
			// This provides instant highlighting on tab switch
			const cachedEntry = await fileCache.getAsync(filePath)
			if (
				cachedEntry.highlights ||
				cachedEntry.brackets ||
				cachedEntry.folds ||
				cachedEntry.errors
			) {
				// 				console.log('[SplitEditorPanel] Hydrating cached highlights for', filePath, {
				// 					highlights: cachedEntry.highlights?.length ?? 0,
				// 					brackets: cachedEntry.brackets?.length ?? 0,
				// 					folds: cachedEntry.folds?.length ?? 0,
				// 					errors: cachedEntry.errors?.length ?? 0,
				// 				})
				resourceManager.hydrateCachedHighlights(filePath, {
					captures: cachedEntry.highlights,
					brackets: cachedEntry.brackets,
					folds: cachedEntry.folds,
					errors: cachedEntry.errors,
				})
			}

			// Register with sync system after file is loaded
			await registerFileWithSync(filePath)
		} catch (error) {
			// 			console.error(
			// 				`[SplitEditorPanel] Failed to load file content for ${filePath}:`,
			// 				error
			// 			)

			// Classify the error and set it
			const fileError = classifyError(filePath, error)
			resourceManager.setFileError(filePath, fileError)

			// Show toast notification
			toast.error(`${getErrorTitle(fileError.type)}: ${fileError.message}`)
		} finally {
			filesBeingOpened.delete(filePath)
		}
	}

	// Expose openFileAsTab
	Object.assign(layoutManager, { openFileAsTab })

	// Custom tab content renderer that integrates with existing editor
	const renderTabContent = (tab: Tab, pane: EditorPane): JSX.Element => {
		if (tab.content.type === 'empty') {
			return (
				<div class="h-full w-full flex items-center justify-center text-muted-foreground">
					<div class="text-center">
						<div class="text-lg font-medium mb-2">Welcome to Split Editor</div>
						<div class="text-sm">
							Select a file from the tree to start editing
						</div>
					</div>
				</div>
			)
		}

		if (tab.content.type === 'file' && tab.content.filePath) {
			// Always render FileTab for file content - it will handle empty files and loading states
			return <FileTab tab={tab} pane={pane} filePath={tab.content.filePath} />
		}

		return (
			<div class="h-full w-full flex items-center justify-center text-muted-foreground">
				<div class="text-center">
					<div class="text-lg font-medium mb-2">Split Editor</div>
					<div class="text-sm">Empty tab</div>
				</div>
			</div>
		)
	}

	return (
		<ActiveFileProvider layoutManager={layoutManager}>
			<div class="h-full w-full">
				<SplitEditor
					layoutManager={layoutManager}
					resourceManager={resourceManager}
					renderTabContent={renderTabContent}
				/>
			</div>
		</ActiveFileProvider>
	)
}
