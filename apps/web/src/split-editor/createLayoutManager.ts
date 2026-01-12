/**
 * Layout Manager Store
 *
 * Reactive SolidJS store managing the split editor layout tree with tabs.
 * Uses createStore with produce for immutable updates and reconcile for efficient tree diffing.
 */

import { batch, createMemo } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import type {
	EditorPane,
	LayoutState,
	NodeId,
	ScrollSyncGroup,
	ScrollSyncMode,
	SerializedLayout,
	SerializedNode,
	SplitContainer,
	SplitDirection,
	SplitNode,
	Tab,
	TabContent,
	TabId,
	TabState,
	ViewSettings,
} from './types'
import {
	createDefaultTabState,
	createDefaultViewSettings,
	isContainer,
	isPane,
} from './types'
import type { ViewMode } from '../fs/types/ViewMode'

function generateId(): NodeId {
	return crypto.randomUUID()
}

function findFirstPane(
	nodes: Record<NodeId, SplitNode>,
	nodeId: NodeId
): NodeId | null {
	const node = nodes[nodeId]
	if (!node) return null
	if (isPane(node)) return node.id
	if (isContainer(node)) {
		return (
			findFirstPane(nodes, node.children[0]) ??
			findFirstPane(nodes, node.children[1])
		)
	}
	return null
}

/** Options for creating a layout manager */
export interface LayoutManagerOptions {
	/** Callback when a tab is closed */
	onTabClose?: (paneId: NodeId, tab: Tab) => void
}

export function createLayoutManager(options: LayoutManagerOptions = {}) {
	const [state, setState] = createStore<LayoutState>({
		rootId: '',
		nodes: {},
		focusedPaneId: null,
		scrollSyncGroups: [],
	})

	// Handlers for dirty state change notifications
	const dirtyChangeHandlers = new Set<
		(paneId: NodeId, tabId: TabId, isDirty: boolean) => void
	>()

	const paneIds = createMemo(() =>
		Object.values(state.nodes)
			.filter((n): n is EditorPane => isPane(n))
			.map((p) => p.id)
	)

	const getAllTabs = createMemo(() => {
		const tabs: Array<{ paneId: NodeId; tab: Tab }> = []
		for (const node of Object.values(state.nodes)) {
			if (isPane(node)) {
				for (const tab of node.tabs) {
					tabs.push({ paneId: node.id, tab })
				}
			}
		}
		return tabs
	})

	const findTabByFilePath = (filePath: string) => {
		for (const node of Object.values(state.nodes)) {
			if (isPane(node)) {
				for (const tab of node.tabs) {
					if (tab.content.filePath === filePath) {
						return { paneId: node.id, tab }
					}
				}
			}
		}
		return null
	}

	function initialize(): void {
		const paneId = generateId()
		const pane: EditorPane = {
			id: paneId,
			type: 'pane',
			parentId: null,
			tabs: [],
			activeTabId: null,
			viewSettings: createDefaultViewSettings(),
		}

		batch(() => {
			setState('rootId', paneId)
			setState('nodes', { [paneId]: pane })
			setState('focusedPaneId', paneId)
		})
	}

	function splitPane(paneId: NodeId, direction: SplitDirection): NodeId {
		const newPaneId = generateId()
		const newContainerId = generateId()

		batch(() => {
			setState(
				produce((s) => {
					const pane = s.nodes[paneId] as EditorPane | undefined
					if (!pane || !isPane(pane)) return

					const parentId = pane.parentId

					const newPane: EditorPane = {
						id: newPaneId,
						type: 'pane',
						parentId: newContainerId,
						tabs: [],
						activeTabId: null,
						viewSettings: { ...pane.viewSettings },
					}

					const container: SplitContainer = {
						id: newContainerId,
						type: 'container',
						parentId: parentId,
						direction,
						sizes: [0.5, 0.5],
						children: [paneId, newPaneId],
					}

					;(s.nodes[paneId] as EditorPane).parentId = newContainerId

					if (parentId) {
						const parent = s.nodes[parentId] as SplitContainer | undefined
						if (parent && isContainer(parent)) {
							const childIndex = parent.children.indexOf(paneId)
							if (childIndex !== -1) {
								parent.children[childIndex] = newContainerId
							}
						}
					} else {
						s.rootId = newContainerId
					}

					s.nodes[newContainerId] = container
					s.nodes[newPaneId] = newPane
				})
			)
		})

		return newPaneId
	}

	function closePane(paneId: NodeId): void {
		batch(() => {
			setState(
				produce((s) => {
					const pane = s.nodes[paneId]
					if (!pane) return

					const parentId = pane.parentId

					if (!parentId) {
						return
					}

					const parent = s.nodes[parentId] as SplitContainer | undefined
					if (!parent || !isContainer(parent)) return

					const siblingId = parent.children.find((id) => id !== paneId)
					if (!siblingId) return

					const sibling = s.nodes[siblingId]
					if (!sibling) return

					const grandparentId = parent.parentId

					sibling.parentId = grandparentId

					if (grandparentId) {
						const grandparent = s.nodes[grandparentId] as
							| SplitContainer
							| undefined
						if (grandparent && isContainer(grandparent)) {
							const parentIndex = grandparent.children.indexOf(parentId)
							if (parentIndex !== -1) {
								grandparent.children[parentIndex] = siblingId
							}
						}
					} else {
						s.rootId = siblingId
					}

					delete s.nodes[paneId]
					delete s.nodes[parentId]

					if (s.focusedPaneId === paneId) {
						s.focusedPaneId = findFirstPane(s.nodes, siblingId)
					}
				})
			)
		})
	}

	function openTab(
		paneId: NodeId,
		content: TabContent,
		viewMode: ViewMode = 'editor'
	): TabId {
		const tabId = generateId()

		setState(
			produce((s) => {
				const pane = s.nodes[paneId] as EditorPane | undefined
				if (!pane || !isPane(pane)) return

				const newTab: Tab = {
					id: tabId,
					content,
					state: createDefaultTabState(),
					isDirty: false,
					viewMode,
				}

				pane.tabs.push(newTab)
				pane.activeTabId = tabId
			})
		)

		return tabId
	}

	function closeTab(paneId: NodeId, tabId: TabId): void {
		let shouldClosePane = false
		let closedTab: Tab | undefined

		const pane = state.nodes[paneId] as EditorPane | undefined
		if (pane && isPane(pane)) {
			closedTab = pane.tabs.find((t) => t.id === tabId)
		}

		setState(
			produce((s) => {
				const pane = s.nodes[paneId] as EditorPane | undefined
				if (!pane || !isPane(pane)) return

				const tabIndex = pane.tabs.findIndex((t) => t.id === tabId)
				if (tabIndex === -1) return

				pane.tabs.splice(tabIndex, 1)

				if (pane.activeTabId === tabId) {
					if (pane.tabs.length > 0) {
						const newIndex = Math.min(tabIndex, pane.tabs.length - 1)
						pane.activeTabId = pane.tabs[newIndex]?.id ?? null
					} else {
						pane.activeTabId = null
					}
				}

				if (pane.tabs.length === 0) {
					shouldClosePane = true
				}
			})
		)

		if (closedTab && options.onTabClose) {
			options.onTabClose(paneId, closedTab)
		}

		if (shouldClosePane) {
			closePane(paneId)
		}
	}

	function setActiveTab(paneId: NodeId, tabId: TabId): void {
		setState(
			produce((s) => {
				const pane = s.nodes[paneId] as EditorPane | undefined
				if (!pane || !isPane(pane)) return

				const tab = pane.tabs.find((t) => t.id === tabId)
				if (tab) {
					pane.activeTabId = tabId
				}
			})
		)
	}

	function moveTab(fromPaneId: NodeId, tabId: TabId, toPaneId: NodeId): void {
		let shouldClosePane = false

		batch(() => {
			setState(
				produce((s) => {
					const fromPane = s.nodes[fromPaneId] as EditorPane | undefined
					const toPane = s.nodes[toPaneId] as EditorPane | undefined
					if (!fromPane || !toPane || !isPane(fromPane) || !isPane(toPane))
						return

					const tabIndex = fromPane.tabs.findIndex((t) => t.id === tabId)
					if (tabIndex === -1) return

					const [tab] = fromPane.tabs.splice(tabIndex, 1)
					if (!tab) return

					if (fromPane.activeTabId === tabId) {
						fromPane.activeTabId = fromPane.tabs[0]?.id ?? null
					}

					toPane.tabs.push(tab)
					toPane.activeTabId = tabId

					if (fromPane.tabs.length === 0) {
						shouldClosePane = true
					}
				})
			)

			if (shouldClosePane) {
				closePane(fromPaneId)
			}
		})
	}

	function updateTabState(
		paneId: NodeId,
		tabId: TabId,
		updates: Partial<TabState>
	): void {
		setState(
			produce((s) => {
				const pane = s.nodes[paneId] as EditorPane | undefined
				if (!pane || !isPane(pane)) return

				const tab = pane.tabs.find((t) => t.id === tabId)
				if (tab) {
					Object.assign(tab.state, updates)
				}
			})
		)
	}

	function setTabDirty(paneId: NodeId, tabId: TabId, isDirty: boolean): void {
		setState(
			produce((s) => {
				const pane = s.nodes[paneId] as EditorPane | undefined
				if (!pane || !isPane(pane)) return

				const tab = pane.tabs.find((t) => t.id === tabId)
				if (tab) {
					tab.isDirty = isDirty
				}
			})
		)

		// Notify all dirty change handlers
		for (const handler of dirtyChangeHandlers) {
			try {
				handler(paneId, tabId, isDirty)
			} catch (error) {
				console.error('Error in dirty change handler:', error)
			}
		}
	}

	function onTabDirtyChange(
		callback: (paneId: NodeId, tabId: TabId, isDirty: boolean) => void
	): () => void {
		dirtyChangeHandlers.add(callback)
		return () => {
			dirtyChangeHandlers.delete(callback)
		}
	}

	function setTabViewMode(
		paneId: NodeId,
		tabId: TabId,
		viewMode: ViewMode
	): void {
		setState(
			produce((s) => {
				const pane = s.nodes[paneId] as EditorPane | undefined
				if (!pane || !isPane(pane)) return

				const tab = pane.tabs.find((t) => t.id === tabId)
				if (tab) {
					tab.viewMode = viewMode
				}
			})
		)
	}

	function cycleViewMode(): void {
		const focusedPaneId = state.focusedPaneId
		if (!focusedPaneId) return

		const pane = state.nodes[focusedPaneId] as EditorPane | undefined
		if (!pane || !isPane(pane)) return

		const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId)
		if (!activeTab || activeTab.content.type !== 'file') return

		const viewModes: ViewMode[] = ['editor', 'ui', 'binary']
		const currentIndex = viewModes.indexOf(activeTab.viewMode)
		const nextIndex = (currentIndex + 1) % viewModes.length
		const nextMode = viewModes[nextIndex]

		if (nextMode) {
			setTabViewMode(focusedPaneId, activeTab.id, nextMode)
		}
	}

	function updateViewSettings(
		paneId: NodeId,
		settings: Partial<ViewSettings>
	): void {
		setState(
			produce((s) => {
				const pane = s.nodes[paneId] as EditorPane | undefined
				if (!pane || !isPane(pane)) return
				Object.assign(pane.viewSettings, settings)
			})
		)
	}

	function updateSplitSizes(
		containerId: NodeId,
		sizes: [number, number]
	): void {
		setState(
			produce((s) => {
				const container = s.nodes[containerId]
				if (container && isContainer(container)) {
					container.sizes = sizes
				}
			})
		)
	}

	function setFocusedPane(paneId: NodeId): void {
		setState('focusedPaneId', paneId)
	}

	function navigateFocus(direction: 'up' | 'down' | 'left' | 'right'): void {
		const currentPaneId = state.focusedPaneId
		if (!currentPaneId) return

		const adjacentPaneId = findAdjacentPane(currentPaneId, direction)
		if (adjacentPaneId) {
			setState('focusedPaneId', adjacentPaneId)
		}
	}

	function findAdjacentPane(
		paneId: NodeId,
		direction: 'up' | 'down' | 'left' | 'right'
	): NodeId | null {
		const pane = state.nodes[paneId]
		if (!pane || !isPane(pane)) return null

		let currentNode: SplitNode = pane
		let parentId = currentNode.parentId

		while (parentId) {
			const parent = state.nodes[parentId]
			if (!parent || !isContainer(parent)) break

			const isHorizontalNav = direction === 'left' || direction === 'right'
			const isVerticalNav = direction === 'up' || direction === 'down'
			const isHorizontalSplit = parent.direction === 'horizontal'
			const isVerticalSplit = parent.direction === 'vertical'

			if (
				(isHorizontalNav && isHorizontalSplit) ||
				(isVerticalNav && isVerticalSplit)
			) {
				const currentChildIndex = parent.children.indexOf(currentNode.id)
				if (currentChildIndex === -1) break

				let targetChildIndex = -1
				if (direction === 'left' || direction === 'up') {
					targetChildIndex = currentChildIndex - 1
				} else if (direction === 'right' || direction === 'down') {
					targetChildIndex = currentChildIndex + 1
				}

				if (
					targetChildIndex >= 0 &&
					targetChildIndex < parent.children.length
				) {
					const targetChildId = parent.children[targetChildIndex]
					if (targetChildId) {
						return findFirstPane(state.nodes, targetChildId)
					}
				}
			}

			currentNode = parent
			parentId = parent.parentId
		}

		return null
	}

	function cycleTab(direction: 'next' | 'prev'): void {
		const focusedPaneId = state.focusedPaneId
		if (!focusedPaneId) return

		const pane = state.nodes[focusedPaneId] as EditorPane | undefined
		if (!pane || !isPane(pane) || pane.tabs.length === 0) return

		const currentIndex = pane.tabs.findIndex((t) => t.id === pane.activeTabId)
		if (currentIndex === -1) return

		const delta = direction === 'next' ? 1 : -1
		const nextIndex =
			(currentIndex + delta + pane.tabs.length) % pane.tabs.length
		const nextTab = pane.tabs[nextIndex]
		if (nextTab) {
			setActiveTab(focusedPaneId, nextTab.id)
		}
	}

	function linkScrollSync(tabIdList: TabId[], mode: ScrollSyncMode): string {
		const groupId = generateId()
		const group: ScrollSyncGroup = {
			id: groupId,
			tabIds: tabIdList,
			mode,
		}

		setState(
			produce((s) => {
				s.scrollSyncGroups.push(group)
			})
		)

		return groupId
	}

	function unlinkScrollSync(groupId: string): void {
		setState(
			produce((s) => {
				const index = s.scrollSyncGroups.findIndex((g) => g.id === groupId)
				if (index !== -1) {
					s.scrollSyncGroups.splice(index, 1)
				}
			})
		)
	}

	function getLayoutTree(): SerializedLayout {
		const nodes: SerializedNode[] = Object.values(state.nodes).map((node) => {
			if (isContainer(node)) {
				return {
					id: node.id,
					parentId: node.parentId,
					type: 'container' as const,
					direction: node.direction,
					sizes: node.sizes,
					children: node.children,
				}
			}
			return {
				id: node.id,
				parentId: node.parentId,
				type: 'pane' as const,
				tabs: node.tabs.map((t) => ({
					id: t.id,
					content: t.content,
					state: t.state,
					isDirty: t.isDirty,
					viewMode: t.viewMode,
				})),
				activeTabId: node.activeTabId,
				viewSettings: node.viewSettings,
			}
		})

		return {
			version: 1,
			rootId: state.rootId,
			nodes,
			focusedPaneId: state.focusedPaneId,
			scrollSyncGroups: [...state.scrollSyncGroups],
		}
	}

	function restoreLayout(layout: SerializedLayout): void {
		const nodes: Record<NodeId, SplitNode> = {}

		for (const serialized of layout.nodes) {
			if (serialized.type === 'container') {
				nodes[serialized.id] = {
					id: serialized.id,
					parentId: serialized.parentId,
					type: 'container',
					direction: serialized.direction!,
					sizes: serialized.sizes!,
					children: serialized.children!,
				}
			} else {
				nodes[serialized.id] = {
					id: serialized.id,
					parentId: serialized.parentId,
					type: 'pane',
					tabs: (serialized.tabs ?? []).map((t) => ({
						...t,
						viewMode: t.viewMode ?? 'editor',
					})),
					activeTabId: serialized.activeTabId ?? null,
					viewSettings: serialized.viewSettings ?? createDefaultViewSettings(),
				}
			}
		}

		batch(() => {
			setState('rootId', layout.rootId)
			setState('nodes', reconcile(nodes))
			setState('focusedPaneId', layout.focusedPaneId ?? null)
			setState('scrollSyncGroups', reconcile(layout.scrollSyncGroups))
		})
	}

	return {
		state,
		paneIds,
		getAllTabs,
		findTabByFilePath,
		initialize,
		splitPane,
		closePane,
		openTab,
		closeTab,
		setActiveTab,
		moveTab,
		updateTabState,
		setTabDirty,
		onTabDirtyChange,
		setTabViewMode,
		cycleViewMode,
		updateViewSettings,
		updateSplitSizes,
		setFocusedPane,
		navigateFocus,
		cycleTab,
		linkScrollSync,
		unlinkScrollSync,
		getLayoutTree,
		restoreLayout,
	}
}

export type LayoutManager = ReturnType<typeof createLayoutManager>
