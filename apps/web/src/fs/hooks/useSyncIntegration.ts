/**
 * Sync integration hook for the split editor panel.
 *
 * Encapsulates sync registration, content watching, and dirty-change bridging
 * so that SplitEditorPanel can stay focused on UI rendering.
 */

import { createEffect, createRoot, runWithOwner, type Owner } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { getCachedPieceTableContent } from '@repo/utils'
import { createFilePath } from '@repo/fs'
import { EditorInstanceAdapter } from '../../split-editor/EditorInstanceAdapter'
import { isPane, type SplitNode, type EditorPane } from '../../split-editor/types'
import { EditorRegistryImpl } from '@repo/code-editor/sync'
import { SyncController, createFilePath as toFilePath } from '@repo/fs'
import { createDocumentStore, type DocumentStore } from '../doc'
import { ensureFs } from '../runtime/fsRuntime'
import { getDefaultSource } from '../config/constants'
import type { PersistedLayoutManager } from '../../split-editor/createPersistedLayoutManager'
import type { FsState } from '../types'
import type { FsActions, FsInternalActions } from '../context/FsContext'

type SyncIntegrationDeps = {
	state: FsState
	actions: FsActions & FsInternalActions
	layoutManager: PersistedLayoutManager
	owner: Owner | null
}

export type SyncIntegrationHandle = {
	/** Register a file with the sync system after it has been loaded. */
	registerFileWithSync: (filePath: string) => void
	/** Initialize sync controller and document store. Returns the document store if successful. */
	initializeSync: () => Promise<DocumentStore | null>
	/** Dispose all sync resources. Call in onCleanup. */
	dispose: () => void
	/** Get the editor adapters map (for external cleanup on tab close). */
	editorAdapters: Map<string, EditorInstanceAdapter>
	/** Get the content watcher cleanups map (for external cleanup on tab close). */
	contentWatcherCleanups: Map<string, () => void>
	/** Get the editor registry. */
	editorRegistry: EditorRegistryImpl
}

export function useSyncIntegration(deps: SyncIntegrationDeps): SyncIntegrationHandle {
	const { state, actions, layoutManager, owner } = deps

	const editorRegistry = new EditorRegistryImpl()
	const editorAdapters = new Map<string, EditorInstanceAdapter>()
	const contentWatcherCleanups = new Map<string, () => void>()
	const previousContent = new Map<string, string>()

	let syncController: SyncController | null = null
	let documentStore: DocumentStore | null = null
	let unsubDirtyChange: (() => void) | null = null
	let disposeRoot: (() => void) | null = null

	function registerFileWithSync(filePath: string): void {
		if (!documentStore || filePath === 'Untitled') return

		const normalizedPath = createFilePath(filePath)

		// Register with document store for sync tracking
		// Run within owner to keep SolidJS reactive context
		if (owner) {
			runWithOwner(owner, () => documentStore!.open(toFilePath(filePath)))
		} else {
			documentStore.open(toFilePath(filePath))
		}

		if (!editorAdapters.has(filePath)) {
			const adapter = new EditorInstanceAdapter({
				filePath,
				getContent: () => {
					const pt = state.files[normalizedPath]?.pieceTable
					if (!pt) return ''
					return getCachedPieceTableContent(unwrap(pt))
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

			const initialPt = state.files[normalizedPath]?.pieceTable
			if (initialPt) {
				previousContent.set(filePath, getCachedPieceTableContent(unwrap(initialPt)))
			}

			if (owner) {
				runWithOwner(owner, () => {
					createEffect(() => {
						const pt = state.files[normalizedPath]?.pieceTable
						if (!pt) return

						const content = getCachedPieceTableContent(unwrap(pt))
						const prev = previousContent.get(filePath)

						if (prev !== undefined && content !== prev) {
							adapter.notifyContentChange(content)
						}
						previousContent.set(filePath, content)
					})
				})
			}

			contentWatcherCleanups.set(filePath, () => {
				previousContent.delete(filePath)
			})
		}
	}

	async function initializeSync(): Promise<DocumentStore | null> {
		try {
			const source = state.activeSource ?? getDefaultSource()
			const fsContext = await ensureFs(source)

			syncController = new SyncController()
			await syncController.start(fsContext.root)

			// Create document store within reactive owner so createMemo/createSignal
			// calls inside it are properly owned and will be disposed
			if (owner) {
				documentStore = runWithOwner(owner, () =>
					createDocumentStore({
						rootCtx: fsContext,
						syncController: syncController!,
					})
				)!
			} else {
				createRoot((dispose) => {
					disposeRoot = dispose
					documentStore = createDocumentStore({
						rootCtx: fsContext,
						syncController: syncController!,
					})
				})
			}

			// Register all currently open file tabs
			for (const node of Object.values(layoutManager.state.nodes) as SplitNode[]) {
				if (!isPane(node)) continue
				for (const tab of node.tabs) {
					if (tab.content.type !== 'file' || !tab.content.filePath || tab.content.filePath === 'Untitled') continue
					registerFileWithSync(tab.content.filePath)
				}
			}

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

			return documentStore
		} catch {
			return null
		}
	}

	function dispose(): void {
		unsubDirtyChange?.()

		for (const adapter of editorAdapters.values()) {
			adapter.dispose()
		}
		editorAdapters.clear()

		for (const cleanup of contentWatcherCleanups.values()) {
			cleanup()
		}
		contentWatcherCleanups.clear()
		previousContent.clear()

		editorRegistry.dispose()
		documentStore?.dispose()
		syncController?.dispose()
		disposeRoot?.()
	}

	return {
		registerFileWithSync,
		initializeSync,
		dispose,
		editorAdapters,
		contentWatcherCleanups,
		editorRegistry,
	}
}
