/**
 * Split Editor Panel
 *
 * Replaces the single editor with a split editor system.
 * Integrates with the existing file system context and provides
 * tab-based editing with split panes.
 *
 * Sync integration and file loading are delegated to dedicated hooks:
 * - useSyncIntegration: sync registration, content watching, dirty-change bridging
 * - useFileOpener: file loading, tab creation, error handling
 *
 * Requirements: 5.3, 5.4, 5.5 - Error handling, file type detection, large files
 */

import { onMount, onCleanup, createEffect, getOwner, type JSX } from 'solid-js'
import { createFileContent, isPane, type SplitNode } from '../../split-editor/types'
import { SplitEditor } from '../../split-editor/components/SplitEditor'
import { FileTab } from '../../split-editor/components/FileTab'
import { useFs, useFsCache } from '../context/FsContext'
import { useLayoutManager } from '../context/LayoutManagerContext'
import { useSyncIntegration } from '../hooks/useSyncIntegration'
import { useFileOpener } from '../hooks/useFileOpener'
import type { Tab, EditorPane, LayoutManager } from '../../split-editor'
import type { DocumentStore } from '../doc'

type SplitEditorPanelProps = {
	onLayoutManagerReady?: (layoutManager: LayoutManager) => void
	onDocumentStoreReady?: (documentStore: DocumentStore) => void
}

export const SplitEditorPanel = (props: SplitEditorPanelProps) => {
	const [state, actions] = useFs()
	const fileCache = useFsCache()
	const layoutManager = useLayoutManager()

	// Capture reactive owner for creating effects in async callbacks
	const owner = getOwner()

	// --- Sync integration (registration, content watching, dirty bridging) ---
	const sync = useSyncIntegration({ state, actions, layoutManager, owner })

	// --- File opener (loading, tab creation, error handling) ---
	const fileOpener = useFileOpener({
		state,
		actions,
		layoutManager,
		fileCache,
		onFileLoaded: (filePath) => sync.registerFileWithSync(filePath),
	})

	// Subscribe to tab close events for resource cleanup
	const unsubTabClose = layoutManager.onTabClose((_paneId, closedTab) => {
		if (closedTab.content.type !== 'file' || !closedTab.content.filePath) {
			return
		}

		const filePath = closedTab.content.filePath

		// Check if any other tabs still have this file open
		const remainingTab = layoutManager.findTabByFilePath(filePath)
		if (!remainingTab) {
			actions.clearFileState(filePath)

			// Clean up sync integration
			const adapter = sync.editorAdapters.get(filePath)
			if (adapter) {
				adapter.dispose()
				sync.editorAdapters.delete(filePath)
			}
			sync.editorRegistry.unregisterEditor(filePath)

			// Clean up content watcher
			const watcherCleanup = sync.contentWatcherCleanups.get(filePath)
			if (watcherCleanup) {
				watcherCleanup()
				sync.contentWatcherCleanups.delete(filePath)
			}
		}
	})

	// Sync active tab to FsState when user switches tabs
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
		if (filePath !== state.selectedPath) {
			actions.setSelectedPathOnly(filePath)
		}
	})

	// Initialize with persistence support
	onMount(async () => {
		// Preload file content BEFORE initializing layout
		const failedPaths = await fileOpener.preloadPersistedFileContent()

		layoutManager.initialize()
		fileOpener.removeFailedTabs(failedPaths)

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

		// The layout manager is usable as soon as it is initialized. Announcing it
		// only after sync finishes means any failure or stall in sync leaves the
		// parent without a manager — and `Fs.openFileAsTab` silently does nothing,
		// so clicking a file in the tree never opens it.
		props.onLayoutManagerReady?.(layoutManager)

		const documentStore = await sync.initializeSync()

		// Notify parent that document store is ready
		if (documentStore) {
			props.onDocumentStoreReady?.(documentStore)
		}
	})

	// Cleanup on unmount
	onCleanup(() => {
		unsubTabClose()
		sync.dispose()
	})

	// Register openFileAsTab on the layout manager so other consumers can use it
	layoutManager.setOpenFileAsTab(fileOpener.openFileAsTab)

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
