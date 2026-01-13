/**
 * FileTab Component
 *
 * Renders file content using FsState (piece tables, highlights, loading state, line starts).
 * All state is managed in FsState - no separate ResourceManager needed.
 */

import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	Match,
	Show,
	Switch,
} from 'solid-js'
import { Editor } from '@repo/code-editor'
import { CursorMode } from '@repo/code-editor'
import type {
	EditorProps,
	ScrollPosition,
} from '@repo/code-editor'
import { toast } from '@repo/ui/toaster'
import { createFilePath } from '@repo/fs'
import { getCachedPieceTableContent } from '@repo/utils'
import { useLayoutManager } from './SplitEditor'
import { useFs } from '~/fs/context/FsContext'
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
 * FileTab - Renders file content from FsState with independent view state per tab
 */
export function FileTab(props: FileTabProps) {
	const layoutManager = useLayoutManager()
	const [state, actions] = useFs()
	const focus = useFocusManager()

	const scrollSyncCoordinator = createScrollSyncCoordinator(layoutManager)

	// Settings category state for UI mode
	const [currentCategory, setCurrentCategory] = createSignal<string>('editor')

	// Binary file view mode: when true, show text editor for binary files
	const [viewBinaryAsText, setViewBinaryAsText] = createSignal(false)

	// Get tree-sitter worker for minimap
	const [treeSitterWorker] = createResource(async () => {
		return getTreeSitterWorker()
	})

	// Normalized path for FsState lookups
	const normalizedPath = createMemo(() => createFilePath(props.filePath))

	// Get piece table from FsState (single source of truth)
	const pieceTable = () => state.pieceTables[normalizedPath()]

	// Get highlights from FsState (accessors for Editor props)
	const highlights = () => state.fileHighlights[normalizedPath()]
	const folds = () => state.fileFolds[normalizedPath()]
	const brackets = () => state.fileBrackets[normalizedPath()]
	const errors = () => state.fileErrors[normalizedPath()]

	// Get content from piece table
	const content = createMemo(() => {
		const pt = pieceTable()
		if (!pt) return ''
		return getCachedPieceTableContent(pt)
	})

	// Create document interface for the Editor using FsState
	const document = createMemo(() => {
		const pt = pieceTable()
		const contentValue = content()

		return {
			filePath: () => props.filePath,
			content: () => contentValue,
			pieceTable: () => pt,
			updatePieceTable: (updater: (current: typeof pt) => typeof pt | undefined) => {
				actions.updatePieceTableForPath(props.filePath, updater)
			},
			isEditable: () => true,
			applyIncrementalEdit: undefined,
		}
	})

	const handleScrollPositionChange = (position: ScrollPosition) => {
		layoutManager.updateTabState(props.pane.id, props.tab.id, {
			scrollTop: position.scrollTop,
			scrollLeft: position.scrollLeft,
			scrollLineIndex: position.lineIndex,
			scrollLineHeight: position.lineHeight,
		})

		const scrollEvent: ScrollEvent = {
			tabId: props.tab.id,
			scrollTop: position.scrollTop,
			scrollLeft: position.scrollLeft,
			scrollHeight: 1000,
			scrollWidth: 1000,
			clientHeight: 500,
			clientWidth: 500,
		}

		scrollSyncCoordinator.handleScroll(scrollEvent)
	}

	const initialScrollPosition = createMemo((): ScrollPosition => ({
		scrollTop: props.tab.state.scrollTop,
		lineIndex: props.tab.state.scrollLineIndex,
		lineHeight: props.tab.state.scrollLineHeight,
		scrollLeft: props.tab.state.scrollLeft,
	}))

	// Restore cursor position from persisted tab state
	// Only provide if we have a non-zero position (user has interacted before)
	const initialCursorPosition = createMemo(() => {
		const pos = props.tab.state.cursorPosition
		// Only restore if there's a meaningful position (not default 0,0)
		if (pos.line === 0 && pos.column === 0) return undefined
		return pos
	})

	const handleCursorPositionChange = (position: { line: number; column: number }) => {
		layoutManager.updateTabState(props.pane.id, props.tab.id, {
			cursorPosition: position,
		})
	}

	// Restore selections from persisted tab state
	const initialSelections = createMemo(() => {
		const sels = props.tab.state.selections
		// Only restore if there are selections
		if (!sels || sels.length === 0) return undefined
		return sels
	})

	const handleSelectionsChange = (selections: { anchor: number; focus: number }[]) => {
		layoutManager.updateTabState(props.pane.id, props.tab.id, {
			selections,
		})
	}

	const handleEditBlocked = () => {
		toast.error('This file is read-only')
	}

	const handleSave = () => {
		layoutManager.setTabDirty(props.pane.id, props.tab.id, false)
	}

	// Get cached lineStarts for instant tab switching
	const cachedLineStarts = createMemo(() => {
		// Access content to establish reactive dependency
		content()
		return state.fileLineStarts[normalizedPath()]
	})

	// TODO: Add externalLoadVersion counter to FsState that increments on file reload
	// This would let Editor reset cursor/scroll when file is externally modified
	const contentVersion = () => 0

	const editorProps = createMemo((): EditorProps => {
		const doc = document()
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
			highlights,
			folds,
			brackets,
			errors,
			treeSitterWorker: tsWorker ?? undefined,
			onSave: handleSave,
			initialScrollPosition: () => initialScrollPosition(),
			onScrollPositionChange: handleScrollPositionChange,
			initialCursorPosition: () => initialCursorPosition(),
			onCursorPositionChange: handleCursorPositionChange,
			initialSelections: () => initialSelections(),
			onSelectionsChange: handleSelectionsChange,
			onEditBlocked: handleEditBlocked,
			initialVisibleContent: () => undefined,
			onCaptureVisibleContent: () => {},
			precomputedLineStarts: cachedLineStarts,
			contentVersion,
		}
	})

	// Must be an accessor function for reactivity in SolidJS
	const viewMode = () => props.tab.viewMode ?? 'editor'

	// Reactive accessors for loading state from FsState
	const status = () => state.fileLoadingStatus[normalizedPath()] ?? 'idle'
	const loadingError = () => state.fileLoadingErrors[normalizedPath()] ?? null
	const fileStats = () => state.fileStats[normalizedPath()]
	const isBinary = () => fileStats()?.contentKind === 'binary'
	// Note: File size isn't stored in ParseResult - BinaryFileIndicator handles undefined gracefully

	// Handle retry for errors
	const handleRetry = () => {
		// Reset error and set to loading
		actions.setFileLoadingError(props.filePath, null)
		actions.setFileLoadingStatus(props.filePath, 'loading')
		// The parent component (SplitEditorPanel) should detect this and reload
	}

	return (
		<div
			class="file-tab absolute inset-0"
			data-testid="file-tab"
			data-file-path={props.filePath}
			data-tab-id={props.tab.id}
		>
			<Show when={status() === 'loading'}>
				<FileLoadingIndicator filePath={props.filePath} progress={0} />
			</Show>

			<Show when={status() === 'error' && loadingError()}>
				<FileLoadingErrorDisplay
					error={loadingError()!}
					filePath={props.filePath}
					retryCount={0}
					onRetry={handleRetry}
				/>
			</Show>

			<Show when={isBinary() && status() !== 'error' && !viewBinaryAsText()}>
				<BinaryFileIndicator
					filePath={props.filePath}
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
