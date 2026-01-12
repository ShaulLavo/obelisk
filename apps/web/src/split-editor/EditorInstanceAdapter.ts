/**
 * EditorInstanceAdapter
 *
 * Adapts the SharedBuffer and LayoutManager to implement the EditorInstance interface
 * required by EditorFileSyncManager for file sync integration.
 */

import type {
	EditorInstance,
	CursorPosition,
	EditorScrollPosition,
	FoldedRegion,
} from '@repo/code-editor/sync'
import type { SharedBuffer } from './createResourceManager'
import type { LayoutManager } from './createLayoutManager'
import type { Tab } from './types'

export interface EditorInstanceAdapterOptions {
	filePath: string
	buffer: SharedBuffer
	layoutManager: LayoutManager
	/** Function to find the tab for this file */
	findTab: () => { paneId: string; tab: Tab } | null
	/** Function to get the tab's dirty state */
	getTabDirty: () => boolean
	/** Function to set the tab's dirty state */
	setTabDirty: (dirty: boolean) => void
}

/**
 * Adapts the web app's buffer/layout system to the EditorInstance interface.
 */
export class EditorInstanceAdapter implements EditorInstance {
	private readonly filePath: string
	private readonly buffer: SharedBuffer
	private readonly layoutManager: LayoutManager
	private readonly findTab: () => { paneId: string; tab: Tab } | null
	private readonly getTabDirty: () => boolean
	private readonly setTabDirty: (dirty: boolean) => void

	private contentChangeHandlers = new Set<(content: string) => void>()
	private dirtyChangeHandlers = new Set<(isDirty: boolean) => void>()
	private editUnsubscribe: (() => void) | null = null
	private lastKnownDirty = false

	constructor(options: EditorInstanceAdapterOptions) {
		this.filePath = options.filePath
		this.buffer = options.buffer
		this.layoutManager = options.layoutManager
		this.findTab = options.findTab
		this.getTabDirty = options.getTabDirty
		this.setTabDirty = options.setTabDirty

		// Subscribe to buffer edits to notify content change handlers
		this.editUnsubscribe = this.buffer.onEdit(() => {
			const content = this.buffer.content()
			for (const handler of this.contentChangeHandlers) {
				try {
					handler(content)
				} catch (error) {
					console.error('[EditorInstanceAdapter] Error in content change handler:', error)
				}
			}
		})
	}

	getContent(): string {
		return this.buffer.content()
	}

	setContent(content: string): void {
		this.buffer.setContent(content)
	}

	isDirty(): boolean {
		return this.getTabDirty()
	}

	markClean(): void {
		this.setTabDirty(false)
		this.notifyDirtyChange(false)
	}

	getCursorPosition(): CursorPosition {
		// The current editor doesn't expose cursor position through the tab state
		// Return a default position (beginning of file)
		return { line: 0, column: 0 }
	}

	setCursorPosition(_position: CursorPosition): void {
		// The current editor doesn't support programmatic cursor positioning through this interface
		// This would require integration with the Editor component's internal state
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
		// The current editor doesn't expose folded regions through the tab state
		return []
	}

	setFoldedRegions(_regions: FoldedRegion[]): void {
		// The current editor doesn't support programmatic fold control through this interface
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
		this.editUnsubscribe?.()
		this.editUnsubscribe = null
		this.contentChangeHandlers.clear()
		this.dirtyChangeHandlers.clear()
	}
}
