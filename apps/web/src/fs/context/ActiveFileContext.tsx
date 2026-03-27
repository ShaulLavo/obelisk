/**
 * ActiveFileContext
 *
 * Single source of truth for "active file" across the system.
 * The active file is derived from the layoutManager's focused pane's active tab.
 *
 * Use useActiveFilePath() to get the currently active file path.
 */

import {
	createContext,
	useContext,
	type JSX,
	createMemo,
	type Accessor,
} from 'solid-js'
import { createFilePath, type FilePath } from '@repo/fs'
import { isPane, type LayoutManager, type Tab } from '../../split-editor'

/**
 * Node and Tab IDs from layout manager.
 */
export type NodeId = string
export type TabId = string

/**
 * Value exposed by ActiveFileContext.
 */
export interface ActiveFileContextValue {
	// ===== Primary State (from layoutManager) =====

	/** ID of the currently focused pane */
	readonly focusedPaneId: Accessor<NodeId | null>

	/** Get active tab ID for a pane */
	getActiveTabId: (paneId: NodeId) => TabId | null

	/** Get active tab for a pane */
	getActiveTab: (paneId: NodeId) => Tab | null

	// ===== Derived Values =====

	/** FilePath of the active file in the focused pane (null if none) */
	readonly activeFilePath: Accessor<FilePath | null>

	/** All open file paths across all panes */
	readonly openFilePaths: Accessor<FilePath[]>

	/** All panes that have a specific file open */
	getPanesWithFile: (path: FilePath) => NodeId[]

	/** Check if a file is open in any pane */
	isFileOpen: (path: FilePath) => boolean

	/** Check if a file is the active file */
	isActiveFile: (path: FilePath) => boolean

	// ===== Actions =====

	/** Set focus to a pane */
	focusPane: (paneId: NodeId) => void

	/** Set active tab in a pane */
	setActiveTab: (paneId: NodeId, tabId: TabId) => void

	/** Open a file as a tab (creates tab if not exists, focuses if exists) */
	openFile: (path: FilePath, paneId?: NodeId) => void

	/** Close a file tab */
	closeFile: (path: FilePath, paneId: NodeId) => void

	// ===== Layout Manager Access =====

	/** Get underlying layout manager (for advanced operations) */
	readonly layoutManager: LayoutManager
}

const ActiveFileContext = createContext<ActiveFileContextValue>()

/**
 * Hook to access active file context.
 * Throws if used outside provider.
 */
export function useActiveFile(): ActiveFileContextValue {
	const context = useContext(ActiveFileContext)
	if (!context) {
		throw new Error('useActiveFile must be used within ActiveFileProvider')
	}
	return context
}

/**
 * Hook to get the active file path (convenience).
 */
export function useActiveFilePath(): Accessor<FilePath | null> {
	return useActiveFile().activeFilePath
}

/**
 * Hook to check if a specific file is active.
 */
export function useIsActiveFile(path: FilePath): Accessor<boolean> {
	const { activeFilePath } = useActiveFile()
	// eslint-disable-next-line solid/reactivity -- path is a static argument, not a reactive signal
	return createMemo(() => activeFilePath() === path)
}

/**
 * Props for ActiveFileProvider.
 */
interface ActiveFileProviderProps {
	layoutManager: LayoutManager
	children: JSX.Element
}

/**
 * Extract FilePath from a Tab's content.
 */
function getTabFilePath(tab: Tab): FilePath | null {
	if (tab.content.type === 'file' && tab.content.filePath) {
		return createFilePath(tab.content.filePath)
	}
	return null
}

/**
 * Provider component that creates ActiveFileContext from a LayoutManager.
 */
export function ActiveFileProvider(props: ActiveFileProviderProps): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- layoutManager is a stable object reference
	const { layoutManager } = props

	// Derive active file path from focused pane's active tab
	const activeFilePath = createMemo<FilePath | null>(() => {
		const focusedPaneId = layoutManager.state.focusedPaneId
		if (!focusedPaneId) return null

		const pane = layoutManager.state.nodes[focusedPaneId]
		if (!pane || !isPane(pane)) return null

		const activeTabId = pane.activeTabId
		if (!activeTabId) return null

		const tab = pane.tabs.find((t) => t.id === activeTabId)
		if (!tab) return null

		return getTabFilePath(tab)
	})

	// Collect all open file paths — delegates to layoutManager.getAllTabs()
	const openFilePaths = createMemo<FilePath[]>(() => {
		const seen = new Set<string>()
		const paths: FilePath[] = []

		for (const { tab } of layoutManager.getAllTabs()) {
			const path = getTabFilePath(tab)
			if (path && !seen.has(path)) {
				seen.add(path)
				paths.push(path)
			}
		}

		return paths
	})

	// Get panes that have a file open — delegates to layoutManager.getAllTabsForFile()
	function getPanesWithFile(path: FilePath): NodeId[] {
		const tabs = layoutManager.getAllTabsForFile(path)
		// Deduplicate pane IDs (a pane could theoretically have the same file in multiple tabs)
		const seen = new Set<string>()
		const paneIds: NodeId[] = []
		for (const { paneId } of tabs) {
			if (!seen.has(paneId)) {
				seen.add(paneId)
				paneIds.push(paneId)
			}
		}
		return paneIds
	}

	// Check if file is open
	function isFileOpen(path: FilePath): boolean {
		return openFilePaths().includes(path)
	}

	// Check if file is active
	function isActiveFile(path: FilePath): boolean {
		return activeFilePath() === path
	}

	// Get active tab ID for a pane
	function getActiveTabId(paneId: NodeId): TabId | null {
		const pane = layoutManager.state.nodes[paneId]
		if (!pane || !isPane(pane)) return null
		return pane.activeTabId ?? null
	}

	// Get active tab for a pane
	function getActiveTab(paneId: NodeId): Tab | null {
		const pane = layoutManager.state.nodes[paneId]
		if (!pane || !isPane(pane)) return null
		const activeTabId = pane.activeTabId
		if (!activeTabId) return null
		return pane.tabs.find((t) => t.id === activeTabId) ?? null
	}

	// Focus a pane
	function focusPane(paneId: NodeId): void {
		layoutManager.setFocusedPane(paneId)
	}

	// Set active tab
	function setActiveTab(paneId: NodeId, tabId: TabId): void {
		layoutManager.setActiveTab(paneId, tabId)
	}

	// Open a file
	function openFile(path: FilePath, paneId?: NodeId): void {
		// Check if file is already open somewhere
		const existing = layoutManager.findTabByFilePath(path)
		if (existing) {
			// Focus the existing tab
			layoutManager.setActiveTab(existing.paneId, existing.tab.id)
			layoutManager.setFocusedPane(existing.paneId)
			return
		}

		// Open in specified pane or focused pane
		const targetPaneId = paneId ?? layoutManager.state.focusedPaneId
		if (!targetPaneId) return

		// Use layoutManager's openFileAsTab if available
		if (layoutManager.openFileAsTab) {
			layoutManager.openFileAsTab(path)
		}
	}

	// Close a file
	function closeFile(path: FilePath, paneId: NodeId): void {
		const pane = layoutManager.state.nodes[paneId]
		if (!pane || !isPane(pane)) return

		const tab = pane.tabs.find((t) => getTabFilePath(t) === path)
		if (tab) {
			layoutManager.closeTab(paneId, tab.id)
		}
	}

	const value: ActiveFileContextValue = {
		focusedPaneId: () => layoutManager.state.focusedPaneId ?? null,
		getActiveTabId,
		getActiveTab,
		activeFilePath,
		openFilePaths,
		getPanesWithFile,
		isFileOpen,
		isActiveFile,
		focusPane,
		setActiveTab,
		openFile,
		closeFile,
		layoutManager,
	}

	return (
		<ActiveFileContext.Provider value={value}>
			{props.children}
		</ActiveFileContext.Provider>
	)
}
