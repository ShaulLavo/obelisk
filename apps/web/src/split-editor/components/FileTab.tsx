/**
 * FileTab Component
 *
 * A tab component that renders file content using the shared Resource Manager.
 * Registers/unregisters with Resource Manager on mount/cleanup and uses
 * shared buffer for content while maintaining independent tab state.
 * Supports multiple view modes: editor, ui (settings).
 *
 * Requirements: 2.1, 2.5, 5.3, 5.4, 5.5, 8.1, 8.2, 8.4, View Mode Support
 */

import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	Match,
	onCleanup,
	onMount,
	Show,
	Switch,
} from 'solid-js'
import { Editor } from '@repo/code-editor'
import { CursorMode } from '@repo/code-editor'
import type {
	EditorProps,
	ScrollPosition,
	DocumentIncrementalEdit,
} from '@repo/code-editor'
import { useLayoutManager, useResourceManager } from './SplitEditor'
import { useFocusManager } from '~/focus/focusManager'
import { getTreeSitterWorker } from '~/treeSitter/workerClient'
import { SettingsTab } from '~/settings/components/SettingsTab'
import type { Tab, EditorPane } from '../types'
import { createScrollSyncCoordinator } from '../createScrollSyncCoordinator'
import type { ScrollEvent } from '../createScrollSyncCoordinator'
import {
	FileLoadingErrorDisplay,
	FileLoadingIndicator,
	BinaryFileIndicator,
} from './FileLoadingErrorDisplay'

export interface FileTabProps {
	tab: Tab
	pane: EditorPane
	filePath: string
}

/**
 * FileTab - Renders file content with shared resources and independent state
 */
export function FileTab(props: FileTabProps) {
	// 	console.log('[FileTab] component created', {
	// 		tabId: props.tab.id,
	// 		filePath: props.filePath,
	// 		scrollTop: props.tab.state.scrollTop,
	// 		scrollLeft: props.tab.state.scrollLeft,
	// 	})

	const layoutManager = useLayoutManager()
	const resourceManager = useResourceManager()
	const focus = useFocusManager()

	onMount(() => {
		// 		console.log('[FileTab] onMount', {
		// 			tabId: props.tab.id,
		// 			filePath: props.filePath,
		// 		})
	})

	const scrollSyncCoordinator = createScrollSyncCoordinator(layoutManager)

	// Settings category state for UI mode
	const [currentCategory, setCurrentCategory] = createSignal<string>('editor')

	// Binary file view mode: when true, show text editor for binary files
	const [viewBinaryAsText, setViewBinaryAsText] = createSignal(false)

	// Get tree-sitter worker for minimap
	const [treeSitterWorker] = createResource(async () => {
		return getTreeSitterWorker()
	})

	// Register for file IMMEDIATELY (not in onMount) so buffer exists when memo runs
	createEffect(() => {
		resourceManager.registerTabForFile(props.tab.id, props.filePath)

		onCleanup(() => {
			resourceManager.unregisterTabFromFile(props.tab.id, props.filePath)
		})
	})

	const buffer = createMemo(() => {
		const buf = resourceManager.getBuffer(props.filePath)
		// 		console.log('[FileTab] buffer memo', {
		// 			filePath: props.filePath,
		// 			hasBuffer: !!buf,
		// 			contentLength: buf?.content()?.length,
		// 		})
		return buf
	})

	const highlightState = createMemo(() =>
		resourceManager.getHighlightState(props.filePath)
	)

	const loadingState = createMemo(() =>
		resourceManager.getLoadingState(props.filePath)
	)

	// Create reactive accessors for highlights
	const highlights = createMemo(() => {
		const state = highlightState()
		if (!state) return undefined

		return {
			captures: state.captures,
			folds: state.folds,
			brackets: state.brackets,
			errors: state.errors,
		}
	})

	createEffect(() => {
		const sharedBuffer = buffer()
		if (!sharedBuffer) return

		const unsubscribe = sharedBuffer.onEdit(() => {})
		onCleanup(unsubscribe)
	})

	// Create document interface for the Editor
	const document = createMemo(() => {
		const sharedBuffer = buffer()

		// 		console.log('[FileTab] document memo', {
		// 			filePath: props.filePath,
		// 			hasSharedBuffer: !!sharedBuffer,
		// 			contentLength: sharedBuffer?.content()?.length,
		// 		})

		if (!sharedBuffer) {
			// 			console.log('[FileTab] document: NO BUFFER, returning empty doc')
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
			pieceTable: () => undefined,
			updatePieceTable: () => {},
			isEditable: () => true,
			applyIncrementalEdit: (edit: DocumentIncrementalEdit) => {
				const textEdit = {
					startIndex: edit.startIndex,
					oldEndIndex: edit.oldEndIndex,
					newEndIndex: edit.newEndIndex,
					startPosition: {
						row: edit.startPosition.row,
						column: edit.startPosition.column,
					},
					oldEndPosition: {
						row: edit.oldEndPosition.row,
						column: edit.oldEndPosition.column,
					},
					newEndPosition: {
						row: edit.newEndPosition.row,
						column: edit.newEndPosition.column,
					},
					insertedText: edit.insertedText,
				}

				void sharedBuffer.applyEdit(textEdit)
				layoutManager.setTabDirty(props.pane.id, props.tab.id, true)
			},
		}
	})

	const handleScrollPositionChange = (position: ScrollPosition) => {
		// 		console.log(`[FileTab] handleScrollPositionChange: lineIndex=${position.lineIndex}, scrollLeft=${position.scrollLeft}, tabId=${props.tab.id}`)
		layoutManager.updateTabState(props.pane.id, props.tab.id, {
			scrollTop: position.lineIndex,
			scrollLeft: position.scrollLeft,
		})

		const scrollEvent: ScrollEvent = {
			tabId: props.tab.id,
			scrollTop: position.lineIndex,
			scrollLeft: position.scrollLeft,
			scrollHeight: 1000,
			scrollWidth: 1000,
			clientHeight: 500,
			clientWidth: 500,
		}

		scrollSyncCoordinator.handleScroll(scrollEvent)
	}

	const initialScrollPosition = createMemo((): ScrollPosition => {
		const pos = {
			lineIndex: props.tab.state.scrollTop,
			scrollLeft: props.tab.state.scrollLeft,
		}
		// 			console.log(`[FileTab] initialScrollPosition: lineIndex=${pos.lineIndex}, scrollLeft=${pos.scrollLeft}, tabId=${props.tab.id}`)
		return pos
	})

	const handleSave = () => {
		layoutManager.setTabDirty(props.pane.id, props.tab.id, false)
	}

	// Get cached lineStarts for instant tab switching
	// Depends on buffer content so it re-runs when content changes (e.g., external file reload)
	const cachedLineStarts = createMemo(() => {
		const buf = buffer()
		// Access content to establish reactive dependency
		// This ensures we re-fetch lineStarts after content is replaced
		buf?.content()

		const lineStarts = resourceManager.getLineStarts(props.filePath)
		// 		console.log('[FileTab] cachedLineStarts memo', {
		// 			filePath: props.filePath,
		// 			hasLineStarts: !!lineStarts,
		// 			lineCount: lineStarts?.length,
		// 		})
		return lineStarts
	})

	// Get contentVersion from buffer for external change detection
	const contentVersion = createMemo(() => buffer()?.contentVersion() ?? 0)

	const editorProps = createMemo((): EditorProps => {
		const doc = document()
		const highlightData = highlights()
		const tsWorker = treeSitterWorker()

		return {
			document: doc,
			isFileSelected: () => true,
			stats: () => undefined,
			fontSize: () => props.pane.viewSettings.fontSize,
			fontFamily: () => 'JetBrains Mono, monospace',
			cursorMode: () => CursorMode.Regular,
			tabSize: () => 4,
			registerEditorArea: (resolver) => focus.registerArea('editor', resolver),
			activeScopes: focus.activeScopes,
			highlights: highlightData?.captures,
			folds: highlightData?.folds,
			brackets: highlightData?.brackets,
			errors: highlightData?.errors,
			treeSitterWorker: tsWorker ?? undefined,
			onSave: handleSave,
			initialScrollPosition: () => initialScrollPosition(),
			onScrollPositionChange: handleScrollPositionChange,
			initialVisibleContent: () => undefined,
			onCaptureVisibleContent: () => {},
			precomputedLineStarts: cachedLineStarts,
			contentVersion,
		}
	})

	// Must be an accessor function for reactivity in SolidJS
	const viewMode = () => props.tab.viewMode ?? 'editor'

	// Reactive accessors for loading state
	const status = () => loadingState()?.status() ?? 'idle'
	const error = () => loadingState()?.error() ?? null
	const isBinary = () => loadingState()?.isBinary() ?? false
	const progress = () => loadingState()?.progress() ?? 0
	const fileSize = () => loadingState()?.fileSize() ?? null
	const retryCount = () => loadingState()?.retryCount() ?? 0

	// Handle retry for errors
	const handleRetry = () => {
		const state = loadingState()
		if (state) {
			state.incrementRetryCount()
			state.setStatus('loading')
			state.setError(null)
			// Trigger reload - the parent should handle the actual file loading
		}
	}

	return (
		<div
			class="file-tab absolute inset-0"
			data-testid="file-tab"
			data-file-path={props.filePath}
			data-tab-id={props.tab.id}
		>
			<Show when={status() === 'loading'}>
				<FileLoadingIndicator filePath={props.filePath} progress={progress()} />
			</Show>

			<Show when={status() === 'error' && error()}>
				<FileLoadingErrorDisplay
					error={error()!}
					filePath={props.filePath}
					retryCount={retryCount()}
					onRetry={handleRetry}
				/>
			</Show>

			<Show when={isBinary() && status() !== 'error' && !viewBinaryAsText()}>
				<BinaryFileIndicator
					filePath={props.filePath}
					fileSize={fileSize() ?? undefined}
					onViewAsText={() => setViewBinaryAsText(true)}
				/>
			</Show>

			<Show
				when={
					status() !== 'loading' &&
					status() !== 'error' &&
					(!isBinary() || viewBinaryAsText())
				}
			>
				<div class="flex h-full flex-col">
					<Show when={isBinary() && viewBinaryAsText()}>
						<div class="flex items-center justify-between bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
							<span>
								Viewing binary file as text (content may appear garbled)
							</span>
							<button
								type="button"
								class="rounded px-2 py-0.5 hover:bg-amber-500/20"
								onClick={() => setViewBinaryAsText(false)}
							>
								Hide
							</button>
						</div>
					</Show>
					<div class="min-h-0 flex-1">
						<Switch fallback={<Editor {...editorProps()} />}>
							<Match when={viewMode() === 'ui'}>
								<SettingsTab
									initialCategory={currentCategory()}
									currentCategory={currentCategory()}
									onCategoryChange={setCurrentCategory}
								/>
							</Match>
						</Switch>
					</div>
				</div>
			</Show>
		</div>
	)
}
