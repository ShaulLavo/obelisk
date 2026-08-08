/**
 * FileTab Component
 *
 * Renders file content using FsState (piece tables, highlights, loading state, line starts).
 * All state is managed in FsState - no separate ResourceManager needed.
 */
import {
	createMemo,
	createSignal,
	Show,
} from 'solid-js'
import { ImperativeEditor } from '@repo/code-editor'
import type { ViewState } from '@repo/code-editor'
import { createFilePath } from '@repo/fs'
import { createEditorSyntaxWorker } from '~/workers/editorSyntaxClient'
import { getCachedPieceTableContent } from '@repo/utils'
import { unwrap } from 'solid-js/store'
import { useLayoutManager } from './SplitEditor'
import { useFs } from '~/fs/context/FsContext'
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
	const scrollSyncCoordinator = createScrollSyncCoordinator(layoutManager)
	// Binary file view mode: when true, show text editor for binary files
	const [viewBinaryAsText, setViewBinaryAsText] = createSignal(false)
	// Normalized path for FsState lookups
	const normalizedPath = createMemo(() => createFilePath(props.filePath))
	// Get file state from unified store
	const fileState = () => state.files[normalizedPath()]
	// Get piece table from FsState (single source of truth).
	//
	// Unwrapped deliberately: the snapshot lives inside a Solid store, which
	// wraps it in a reactive proxy. The proxy defeats the tree walk that reads
	// the text out (its buffers no longer pass Array.isArray), so reading a
	// proxied snapshot yields an empty string and every file renders blank.
	// The `.pieceTable` access above is still tracked, so this stays reactive.
	const pieceTable = () => {
		const stored = fileState()?.pieceTable
		return stored ? unwrap(stored) : undefined
	}
	// Get content from piece table
	const content = createMemo(() => {
		const pt = pieceTable()
		if (!pt) return ''
		return getCachedPieceTableContent(pt)
	})
	// Scroll position persistence
	const handleScrollChange = (position: {
		scrollTop: number
		scrollLeft: number
		lineIndex: number
		lineHeight: number
	}) => {
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
	const handleCursorChange = (position: { line: number; column: number }) => {
		layoutManager.updateTabState(props.pane.id, props.tab.id, {
			cursorPosition: position,
		})
	}
	const handleSelectionsChange = (selections: { anchor: number; focus: number }[]) => {
		layoutManager.updateTabState(props.pane.id, props.tab.id, {
			selections,
		})
	}
	const handleSave = () => {
		layoutManager.setTabDirty(props.pane.id, props.tab.id, false)
	}
	// Build initial view state from persisted tab state
	const initialViewState = createMemo((): Partial<ViewState> | undefined => {
		const tabState = props.tab.state
		const result: Partial<ViewState> = {
			scrollTop: tabState.scrollTop,
			scrollLeft: tabState.scrollLeft,
		}
		// Only restore cursor if there's a meaningful position
		const pos = tabState.cursorPosition
		if (pos.line !== 0 || pos.column !== 0) {
			result.cursorLine = pos.line
			result.cursorColumn = pos.column
		}
		// Restore selections if present
		const sels = tabState.selections
		if (sels && sels.length > 0) {
			result.selections = sels
		}
		return result
	})
	// TODO: Add externalLoadVersion counter to FsState that increments on file reload
	const contentVersion = () => 0
	// Reactive accessors for loading state from FsState
	const loadingState = () => fileState()?.loadingState
	const status = () => loadingState()?.status ?? 'idle'
	const loadingError = () => {
		const ls = loadingState()
		return ls?.status === 'error' ? ls.error : null
	}
	const fileStats = () => fileState()?.stats
	const isBinary = () => fileStats()?.contentKind === 'binary'
	// Handle retry for errors
	const handleRetry = () => {
		actions.setLoadingState(props.filePath, { status: 'loading' })
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
						<ImperativeEditor
							documentKey={() => props.filePath}
							content={content}
							contentVersion={contentVersion}
							fontSize={() => props.pane.viewSettings.fontSize}
							fontFamily={() => 'JetBrains Mono, monospace'}
							tabSize={() => 4}
							createWorker={createEditorSyntaxWorker}
							onSave={handleSave}
							onScrollChange={handleScrollChange}
							onCursorChange={handleCursorChange}
							onSelectionsChange={handleSelectionsChange}
							initialViewState={initialViewState}
						/>
					</div>
				</div>
			</Show>
		</div>
	)
}
