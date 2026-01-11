/**
 * FileTab Component
 *
 * A tab component that renders file content using the shared Resource Manager.
 * Registers/unregisters with Resource Manager on mount/cleanup and uses
 * shared buffer for content while maintaining independent tab state.
 *
 * Requirements: 2.1, 2.5, 8.1, 8.2, 8.4
 */

import { createEffect, createMemo, onCleanup, onMount } from 'solid-js'
import { Editor } from '@repo/code-editor'
import type { EditorProps, ScrollPosition, DocumentIncrementalEdit } from '@repo/code-editor'
import { useLayoutManager, useResourceManager } from './SplitEditor'
import type { Tab, EditorPane } from '../types'
import { createScrollSyncCoordinator } from '../createScrollSyncCoordinator'
import type { ScrollEvent } from '../createScrollSyncCoordinator'

export interface FileTabProps {
	tab: Tab
	pane: EditorPane
	filePath: string
}

/**
 * FileTab - Renders file content with shared resources and independent state
 *
 * This component:
 * - Registers with Resource Manager on mount for shared resources
 * - Uses shared buffer for file content (coordinated across tabs)
 * - Maintains independent scroll position, selections, cursor per tab
 * - Uses pane's view settings for display (shared across tabs in pane)
 */
export function FileTab(props: FileTabProps) {
	const layoutManager = useLayoutManager()
	const resourceManager = useResourceManager()

	console.log(`[FileTab] Rendering FileTab for ${props.filePath}, tabId: ${props.tab.id}`)

	// Create scroll sync coordinator
	const scrollSyncCoordinator = createScrollSyncCoordinator(layoutManager)

	// Register this tab for the file on mount
	onMount(() => {
		console.log(`[FileTab] Registering tab ${props.tab.id} for file ${props.filePath}`)
		resourceManager.registerTabForFile(props.tab.id, props.filePath)
	})

	// Unregister on cleanup
	onCleanup(() => {
		console.log(`[FileTab] Unregistering tab ${props.tab.id} for file ${props.filePath}`)
		resourceManager.unregisterTabFromFile(props.tab.id, props.filePath)
	})

	// Get shared resources
	const buffer = createMemo(() => resourceManager.getBuffer(props.filePath))
	const highlights = createMemo(() => resourceManager.getHighlightState(props.filePath))

	// Subscribe to edits from other tabs showing the same file
	createEffect(() => {
		const sharedBuffer = buffer()
		if (!sharedBuffer) return

		const unsubscribe = sharedBuffer.onEdit((edit) => {
			// Edit is already applied to shared buffer content
			// Tab state (scroll, selections) remains independent
			console.log(`[FileTab] Received edit from another tab for ${props.filePath}`)
		})

		onCleanup(unsubscribe)
	})

	// Create document interface for the Editor
	const document = createMemo(() => {
		const sharedBuffer = buffer()
		if (!sharedBuffer) {
			// Fallback if buffer not ready
			return {
				filePath: () => props.filePath,
				content: () => '',
				pieceTable: () => undefined,
				updatePieceTable: () => {},
				isEditable: () => true,
				applyIncrementalEdit: undefined,
			}
		}

		return {
			filePath: () => props.filePath,
			content: sharedBuffer.content,
			pieceTable: () => undefined, // TODO: Integrate with piece table if needed
			updatePieceTable: () => {}, // TODO: Implement if piece table is used
			isEditable: () => true,
			applyIncrementalEdit: (edit: DocumentIncrementalEdit) => {
				// Convert DocumentIncrementalEdit to TextEdit format
				const textEdit = {
					startIndex: edit.startIndex,
					oldEndIndex: edit.oldEndIndex,
					newEndIndex: edit.newEndIndex,
					startPosition: { row: edit.startPosition.row, column: edit.startPosition.column },
					oldEndPosition: { row: edit.oldEndPosition.row, column: edit.oldEndPosition.column },
					newEndPosition: { row: edit.newEndPosition.row, column: edit.newEndPosition.column },
					insertedText: edit.insertedText,
				}

				// Apply edit to shared buffer (will notify other tabs)
				void sharedBuffer.applyEdit(textEdit)

				// Mark tab as dirty
				layoutManager.setTabDirty(props.pane.id, props.tab.id, true)
			},
		}
	})

	// Handle scroll position changes (independent per tab)
	const handleScrollPositionChange = (position: ScrollPosition) => {
		layoutManager.updateTabState(props.pane.id, props.tab.id, {
			scrollTop: position.lineIndex,
			scrollLeft: position.scrollLeft,
		})

		// Create scroll event for sync coordination
		const scrollEvent: ScrollEvent = {
			tabId: props.tab.id,
			scrollTop: position.lineIndex,
			scrollLeft: position.scrollLeft,
			scrollHeight: 1000, // TODO: Get actual scroll dimensions from editor
			scrollWidth: 1000,
			clientHeight: 500,
			clientWidth: 500,
		}

		// Handle scroll sync
		scrollSyncCoordinator.handleScroll(scrollEvent)
	}

	// Get initial scroll position from tab state
	const initialScrollPosition = createMemo((): ScrollPosition => ({
		lineIndex: props.tab.state.scrollTop,
		scrollLeft: props.tab.state.scrollLeft,
	}))

	// Handle save action
	const handleSave = () => {
		// TODO: Implement actual file saving
		layoutManager.setTabDirty(props.pane.id, props.tab.id, false)
		console.log(`[FileTab] Saved ${props.filePath}`)
	}

	// Create editor props
	const editorProps = createMemo((): EditorProps => ({
		document: document(),
		isFileSelected: () => true, // Tab is active if this component is rendered
		stats: () => undefined, // TODO: Integrate with file stats if needed
		fontSize: () => props.pane.viewSettings.fontSize,
		fontFamily: () => 'JetBrains Mono, monospace', // TODO: Make configurable
		cursorMode: () => 'regular' as const,
		tabSize: () => 4, // TODO: Make configurable
		highlights: highlights()?.captures,
		folds: highlights()?.folds,
		brackets: highlights()?.brackets,
		errors: highlights()?.errors,
		onSave: handleSave,
		initialScrollPosition: () => initialScrollPosition(),
		onScrollPositionChange: handleScrollPositionChange,
		// TODO: Add visible content caching for better performance
		initialVisibleContent: () => undefined,
		onCaptureVisibleContent: () => {},
	}))

	return (
		<div 
			class="file-tab h-full w-full"
			data-testid="file-tab"
			data-file-path={props.filePath}
			data-tab-id={props.tab.id}
		>
			<Editor {...editorProps()} />
		</div>
	)
}