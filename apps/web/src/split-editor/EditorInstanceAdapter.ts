/**
 * EditorInstanceAdapter
 *
 * Adapts FsState and LayoutManager to implement the EditorInstance interface
 * required by EditorFileSyncManager for file sync integration.
 */

import type {
	EditorInstance,
	CursorPosition,
	EditorScrollPosition,
	FoldedRegion,
} from '@repo/code-editor/sync'
import type { LayoutManager } from './createLayoutManager'
import type { Tab } from './types'

export interface EditorInstanceAdapterOptions {
	filePath: string
	/** Get current content from FsState piece table */
	getContent: () => string
	/** Set content (replaces piece table) - used for external reload */
	setContent: (content: string) => void
	layoutManager: LayoutManager
	/** Function to find the tab for this file */
	findTab: () => { paneId: string; tab: Tab } | null
	/** Function to get the tab's dirty state */
	getTabDirty: () => boolean
	/** Function to set the tab's dirty state */
	setTabDirty: (dirty: boolean) => void
}

/**
 * Adapts the web app's FsState/layout system to the EditorInstance interface.
 */
export class EditorInstanceAdapter implements EditorInstance {
	private readonly filePath: string
	private readonly _getContent: () => string
	private readonly _setContent: (content: string) => void
	private readonly layoutManager: LayoutManager
	private readonly findTab: () => { paneId: string; tab: Tab } | null
	private readonly getTabDirty: () => boolean
	private readonly setTabDirty: (dirty: boolean) => void

	private contentChangeHandlers = new Set<(content: string) => void>()
	private dirtyChangeHandlers = new Set<(isDirty: boolean) => void>()
	private lastKnownDirty = false

	constructor(options: EditorInstanceAdapterOptions) {
		this.filePath = options.filePath
		this._getContent = options.getContent
		this._setContent = options.setContent
		this.layoutManager = options.layoutManager
		this.findTab = options.findTab
		this.getTabDirty = options.getTabDirty
		this.setTabDirty = options.setTabDirty
	}

	getContent(): string {
		return this._getContent()
	}

	setContent(content: string): void {
		this._setContent(content)
	}

	isDirty(): boolean {
		return this.getTabDirty()
	}

	markClean(): void {
		this.setTabDirty(false)
		this.notifyDirtyChange(false)
	}

	getCursorPosition(): CursorPosition {
		const tabInfo = this.findTab()
		if (!tabInfo) {
			return { line: 0, column: 0 }
		}
		return tabInfo.tab.state.cursorPosition
	}

	setCursorPosition(_position: CursorPosition): void {
		// TODO: Requires integration with Editor component's internal state
	}

	getScrollPosition(): EditorScrollPosition {
		const tabInfo = this.findTab()
		if (!tabInfo) {
			return { scrollTop: 0, scrollLeft: 0 }
		}
		return {
			scrollTop: tabInfo.tab.state.scrollTop,
			scrollLeft: tabInfo.tab.state.scrollLeft,
		}
	}

	setScrollPosition(position: EditorScrollPosition): void {
		const tabInfo = this.findTab()
		if (!tabInfo) return

		this.layoutManager.updateTabState(tabInfo.paneId, tabInfo.tab.id, {
			scrollTop: position.scrollTop,
			scrollLeft: position.scrollLeft,
		})
	}

	getFoldedRegions(): FoldedRegion[] {
		// TODO: Expose folded regions from Editor component
		return []
	}

	setFoldedRegions(_regions: FoldedRegion[]): void {
		// TODO: Requires integration with Editor component's fold state
	}

	onContentChange(callback: (content: string) => void): () => void {
		this.contentChangeHandlers.add(callback)
		return () => {
			this.contentChangeHandlers.delete(callback)
		}
	}

	onDirtyStateChange(callback: (isDirty: boolean) => void): () => void {
		this.dirtyChangeHandlers.add(callback)
		return () => {
			this.dirtyChangeHandlers.delete(callback)
		}
	}

	/**
	 * Called when content changes to notify handlers.
	 * Should be called by external code when piece table changes.
	 */
	notifyContentChange(content: string): void {
		for (const handler of this.contentChangeHandlers) {
			try {
				handler(content)
			} catch (error) {
				console.error('[EditorInstanceAdapter] Error in content change handler:', error)
			}
		}
	}

	/**
	 * Called when dirty state changes to notify handlers.
	 * Should be called by external code when tab dirty state changes.
	 */
	notifyDirtyChange(isDirty: boolean): void {
		if (isDirty === this.lastKnownDirty) return
		this.lastKnownDirty = isDirty

		for (const handler of this.dirtyChangeHandlers) {
			try {
				handler(isDirty)
			} catch (error) {
				console.error('[EditorInstanceAdapter] Error in dirty change handler:', error)
			}
		}
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		this.contentChangeHandlers.clear()
		this.dirtyChangeHandlers.clear()
	}
}
