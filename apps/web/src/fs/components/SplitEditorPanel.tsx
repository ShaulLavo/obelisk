/**
 * Split Editor Panel
 *
 * Replaces the single editor with a split editor system.
 * Integrates with the existing file system context and provides
 * tab-based editing with split panes.
 *
 * Requirements: 5.3, 5.4, 5.5 - Error handling, file type detection, large files
 */

import { onMount, onCleanup, createEffect, getOwner, runWithOwner, type JSX, type Owner } from 'solid-js'
import { toast } from '@repo/ui/toaster'
import { getCachedPieceTableContent } from '@repo/utils'
import { createFilePath } from '@repo/fs'
import { SplitEditor } from '../../split-editor/components/SplitEditor'
import { FileTab } from '../../split-editor/components/FileTab'
import { createFileContent, isPane, type SplitNode } from '../../split-editor/types'
import { EditorInstanceAdapter } from '../../split-editor/EditorInstanceAdapter'
import { useFs } from '../context/FsContext'
import { useLayoutManager } from '../context/LayoutManagerContext'
import { ensureFs } from '../runtime/fsRuntime'
import { DEFAULT_SOURCE } from '../config/constants'
import type { Tab, EditorPane, LayoutManager } from '../../split-editor'
import {
	classifyError,
	createFileTooLargeError,
	MAX_FILE_SIZE,
	getErrorTitle,
} from '../../split-editor/fileLoadingErrors'
import { loadFile } from '../services/FileLoadingService'
import {
	EditorFileSyncManager,
	EditorRegistryImpl,
	DEFAULT_EDITOR_SYNC_CONFIG,
	type NotificationSystem,
} from '@repo/code-editor/sync'
import { FileSyncManager } from '@repo/fs'

type SplitEditorPanelProps = {
	onLayoutManagerReady?: (layoutManager: LayoutManager) => void
	onSyncManagerReady?: (syncManager: EditorFileSyncManager) => void
}

export const SplitEditorPanel = (props: SplitEditorPanelProps) => {
	const [state, actions] = useFs()
	const { fileCache } = actions
	const layoutManager = useLayoutManager()

	// Capture reactive owner for creating effects in async callbacks
	const owner = getOwner()

	// Editor registry for tracking open editors
	const editorRegistry = new EditorRegistryImpl()

	// Adapters for each open file (keyed by file path)
	const editorAdapters = new Map<string, EditorInstanceAdapter>()

	// Content watchers cleanup functions (keyed by file path)
	const contentWatcherCleanups = new Map<string, () => void>()

	// Track previous content for change detection
	const previousContent = new Map<string, string>()

	// Sync managers (initialized async in onMount)
	let fileSyncManager: FileSyncManager | null = null
	let editorSyncManager: EditorFileSyncManager | null = null
	let unsubDirtyChange: (() => void) | null = null

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

	// Subscribe to tab close events for resource cleanup
	const unsubTabClose = layoutManager.onTabClose((_paneId, closedTab) => {
		// Only cleanup file resources, not empty tabs
		if (closedTab.content.type !== 'file' || !closedTab.content.filePath) {
			return
		}

		const filePath = closedTab.content.filePath

		// Check if any other tabs still have this file open
		const remainingTab = layoutManager.findTabByFilePath(filePath)
		if (!remainingTab) {
			actions.clearFileState(filePath)

			// Clean up sync integration
			const adapter = editorAdapters.get(filePath)
			if (adapter) {
				adapter.dispose()
				editorAdapters.delete(filePath)
			}
			editorRegistry.unregisterEditor(filePath)

			// Clean up content watcher
			const watcherCleanup = contentWatcherCleanups.get(filePath)
			if (watcherCleanup) {
				watcherCleanup()
				contentWatcherCleanups.delete(filePath)
			}
		}
	})

	// Sync active tab to FsState when user switches tabs
	// This keeps selectedPath in sync with layoutManager
	createEffect(() => {
		const focusedPaneId = layoutManager.state.focusedPaneId
		if (!focusedPaneId) return

		const pane = layoutManager.state.nodes[focusedPaneId]
		if (!pane || !isPane(pane)) return

		const editorPaneNode = pane as EditorPane
		const activeTabId = editorPaneNode.activeTabId
		if (!activeTabId) return

		const tab = editorPaneNode.tabs.find((t) => t.id === activeTabId)
		if (!tab || tab.content.type !== 'file' || !tab.content.filePath) return

		const filePath = tab.content.filePath
		// Only sync if different from current selection to avoid loops
		if (filePath !== state.selectedPath) {
			actions.setSelectedPathOnly(filePath)
		}
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
					actions.preloadFileContent(filePath, '')
					continue
				}

				try {
					// loadFile parses with tree-sitter and calls onSyntaxReady
					const result = await loadFile({
						source,
						path: filePath,
						fileCache,
						onSyntaxReady: (syntax) => {
							actions.setSyntax(filePath, syntax)
						},
					})

					// Build line starts for editor performance
					actions.preloadFileContent(filePath, result.content)
					// Set saved content baseline for dirty tracking
					actions.setSavedContent(filePath, result.content)
				} catch {
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
		const hasTabs = (Object.values(layoutManager.state.nodes) as SplitNode[]).some(
			(node) => isPane(node) && node.tabs.length > 0
		)

		if (!hasTabs) {
			const focusedPaneId = layoutManager.state.focusedPaneId

			if (focusedPaneId) {
				const untitledPath = 'Untitled'
				actions.preloadFileContent(untitledPath, '')
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

			// Register already-open files with the sync manager
			for (const [path] of getAllOpenFileTabs()) {
				if (path !== 'Untitled') {
					registerFileWithSync(path)
				}
			}

			// Subscribe to dirty state changes and propagate to adapters
			unsubDirtyChange = layoutManager.onTabDirtyChange(
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

			// Notify parent that sync manager is ready
			props.onSyncManagerReady?.(editorSyncManager)
		} catch {
			// Ignore initialization errors
		}

		// Notify parent that layout manager is ready
		props.onLayoutManagerReady?.(layoutManager)
	})

	// Cleanup on unmount
	onCleanup(() => {
		// Unsubscribe from tab close events
		unsubTabClose()

		// Unsubscribe from dirty state changes
		unsubDirtyChange?.()

		// Dispose all adapters
		for (const adapter of editorAdapters.values()) {
			adapter.dispose()
		}
		editorAdapters.clear()

		// Clean up all content watchers
		for (const cleanup of contentWatcherCleanups.values()) {
			cleanup()
		}
		contentWatcherCleanups.clear()
		previousContent.clear()

		// Dispose registry and sync managers
		editorRegistry.dispose()
		editorSyncManager?.dispose()
	})

	/**
	 * Get all open file tabs across all panes.
	 */
	function getAllOpenFileTabs(): [string, Tab][] {
		const result: [string, Tab][] = []
		for (const node of Object.values(layoutManager.state.nodes) as SplitNode[]) {
			if (isPane(node)) {
				for (const tab of node.tabs) {
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
	function registerFileWithSync(filePath: string): void {
		if (!editorSyncManager || filePath === 'Untitled') return

		const normalizedPath = createFilePath(filePath)

		// Create adapter if not exists
		if (!editorAdapters.has(filePath)) {
			const adapter = new EditorInstanceAdapter({
				filePath,
				getContent: () => {
					const pt = state.files[normalizedPath]?.pieceTable
					if (!pt) return ''
					return getCachedPieceTableContent(pt)
				},
				setContent: (content: string) => {
					actions.setPieceTableContent(filePath, content)
				},
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

			// Set up content change tracking
			// Store initial content for change detection
			const initialPt = state.files[normalizedPath]?.pieceTable
			if (initialPt) {
				previousContent.set(filePath, getCachedPieceTableContent(initialPt))
			}

			// Create effect to watch piece table changes and notify adapter
			// Use runWithOwner to ensure proper reactive context when called from async
			if (owner) {
				runWithOwner(owner, () => {
					createEffect(() => {
						const pt = state.files[normalizedPath]?.pieceTable
						if (!pt) return

						const content = getCachedPieceTableContent(pt)
						const prev = previousContent.get(filePath)

						if (prev !== undefined && content !== prev) {
							adapter.notifyContentChange(content)
						}
						previousContent.set(filePath, content)
					})
				})
			}

			// Store cleanup function for this file's tracking
			contentWatcherCleanups.set(filePath, () => {
				previousContent.delete(filePath)
			})
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
		actions.preloadFileContent(filePath, '')
		actions.setLoadingState(filePath, { status: 'loading' })

		// Create the tab first (shows loading indicator)
		const content = createFileContent(filePath)
		layoutManager.openTab(focusedPaneId, content)

		try {
			// loadFile parses with tree-sitter and calls onSyntaxReady
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

			// Load content into resource manager (for lineStarts, loading state)
			actions.preloadFileContent(filePath, result.content)
			actions.setLoadingState(filePath, { status: 'loaded' })

			// Set saved content baseline for dirty tracking
			actions.setSavedContent(filePath, result.content)

			// Register with sync system after file is loaded
			registerFileWithSync(filePath)
		} catch (error) {
			// Classify the error and set it
			const fileError = classifyError(filePath, error)
			actions.setLoadingError(filePath, fileError)

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
		<div class="h-full w-full">
			<SplitEditor
				layoutManager={layoutManager}
				renderTabContent={renderTabContent}
			/>
		</div>
	)
}
