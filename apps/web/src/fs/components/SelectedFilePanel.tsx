import type {
	EditorSyntaxHighlight,
	HighlightOffsets,
	TextEditorDocument,
} from '@repo/code-editor'
import {
	CursorMode,
	Editor,
	getHighlightClassForScope,
} from '@repo/code-editor'
import { getEditCharDelta, getEditLineDelta } from '@repo/utils/highlightShift'

import {
	Accessor,
	Match,
	Switch,
	batch,
	createEffect,
	createMemo,
	createResource,
	createSignal,
} from 'solid-js'
import { useFocusManager } from '~/focus/focusManager'
import { useFs } from '../../fs/context/FsContext'

import { sendIncrementalTreeEdit } from '../../treeSitter/incrementalEdits'
import { getTreeSitterWorker } from '../../treeSitter/workerClient'
import { useTabs } from '../hooks/useTabs'

import { Tabs } from './Tabs'
import { unwrap } from 'solid-js/store'
import { logger } from '../../logger'
import { SettingsTab } from '../../settings/components/SettingsTab'
import { SettingsJSONTab } from '../../settings/components/SettingsJSONTab'
import { useSettingsRoute } from '../../settings/hooks/useSettingsRoute'

const FONT_OPTIONS = [
	{
		label: 'JetBrains Mono',
		value: '"JetBrains Mono Variable", monospace',
	},
	{
		label: 'Geist Mono',
		value: '"Geist Mono", monospace',
	},
]
const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = FONT_OPTIONS[0]?.value ?? 'monospace'
const MAX_EDITOR_TABS = 1000

type SelectedFilePanelProps = {
	isFileSelected: Accessor<boolean>
	currentPath?: string
}

export const SelectedFilePanel = (props: SelectedFilePanelProps) => {
	const [
		state,
		{
			selectPath,
			updateSelectedFilePieceTable,
			updateSelectedFileHighlights,
			applySelectedFileHighlightOffset,
			updateSelectedFileFolds,
			updateSelectedFileBrackets,
			updateSelectedFileErrors,
			updateSelectedFileScrollPosition,
			updateSelectedFileVisibleContent,
			saveFile,
			fileCache,
		},
	] = useFs()
	const focus = useFocusManager()
	const highlightLog = logger.withTag('highlights')
	
	// Initialize settings route
	const settingsRoute = useSettingsRoute()

	const isBinary = () => state.selectedFileStats?.contentKind === 'binary'
	const isSettingsFile = () => state.selectedPath === '/.system/settings.json'
	
	// Check if we should show settings based on URL routing or if settings file is selected
	const shouldShowSettings = () => {
		return settingsRoute.isSettingsOpen() || isSettingsFile()
	}
	
	// Check if we should show JSON view
	const shouldShowJSONView = () => {
		return settingsRoute.isJSONView() || (isSettingsFile() && settingsRoute.isJSONView())
	}

	const [documentVersion, setDocumentVersion] = createSignal(0)
	const [treeSitterWorker] = createResource(async () => getTreeSitterWorker())

	const [tabsState, tabsActions] = useTabs(() => state.lastKnownFilePath, {
		maxTabs: MAX_EDITOR_TABS,
	})

	createEffect(() => {
		fileCache.setOpenTabs(tabsState())
	})

	const handleTabSelect = (path: string) => {
		if (!path || path === state.selectedPath) return
		void selectPath(path)
	}

	const handleTabClose = (path: string) => {
		const isClosingActiveTab = path === state.selectedPath

		// Get the previous tab from history before closing
		const previousTab = isClosingActiveTab
			? tabsActions.getPreviousTab(path)
			: undefined

		console.log('[handleTabClose]', {
			path,
			isClosingActiveTab,
			previousTab,
			currentSelectedPath: state.selectedPath,
			tabsCount: tabsState().length,
		})

		// Close the tab
		tabsActions.closeTab(path)

		// Switch to the previous tab or clear selection
		if (isClosingActiveTab) {
			if (previousTab) {
				console.log('[handleTabClose] switching to previous tab:', previousTab)
				void selectPath(previousTab)
			} else {
				// No previous tab available, clear selection
				console.log('[handleTabClose] no previous tab, clearing selection')
				void selectPath('')
			}
		}
	}

	const tabLabel = (path: string) => {
		if (path === '/.system/settings.json') {
			return shouldShowJSONView() ? 'Settings (JSON)' : 'Settings'
		}
		return path.split('/').pop() || path
	}

	const isEditable = () =>
		props.isFileSelected() && !state.selectedFileLoading && !state.loading

	const editorDocument: TextEditorDocument = {
		filePath: () => state.lastKnownFilePath,
		content: () => state.selectedFileContent,
		pieceTable: () => state.selectedFilePieceTable,
		updatePieceTable: updateSelectedFilePieceTable,
		isEditable,
		applyIncrementalEdit: (edit) => {
			if (isBinary()) return
			const path = state.lastKnownFilePath
			const parsePromise = sendIncrementalTreeEdit(path, edit)
			if (!parsePromise) return

			const charDelta = getEditCharDelta(edit)
			const lineDelta = getEditLineDelta(edit)

			applySelectedFileHighlightOffset({
				charDelta,
				lineDelta,
				fromCharIndex: edit.startIndex,
				fromLineRow: edit.startPosition.row,
				oldEndRow: edit.oldEndPosition.row,
				newEndRow: edit.newEndPosition.row,
				oldEndIndex: edit.oldEndIndex,
				newEndIndex: edit.newEndIndex,
			})

			void parsePromise.then((result) => {
				if (result && path === state.lastKnownFilePath) {
					batch(() => {
						updateSelectedFileHighlights(result.captures)
						updateSelectedFileFolds(result.folds)
						updateSelectedFileBrackets(result.brackets)
						updateSelectedFileErrors(result.errors)
						setDocumentVersion((v) => v + 1)
					})
				}
			})
		},
	}

	const editorHighlights = createMemo<EditorSyntaxHighlight[] | undefined>(
		() => {
			const captures = state.selectedFileHighlights
			if (!captures || captures.length === 0) {
				return undefined
			}
			const unwrapped = unwrap(captures)
			const next: EditorSyntaxHighlight[] = []
			for (let i = 0; i < unwrapped.length; i += 1) {
				const capture = unwrapped[i]
				if (!capture) continue
				const className =
					capture.className ?? getHighlightClassForScope(capture.scope)
				next.push({
					startIndex: capture.startIndex,
					endIndex: capture.endIndex,
					scope: capture.scope,
					className,
				})
			}
			return next
		}
	)

	const editorHighlightOffset = createMemo<HighlightOffsets | undefined>(() => {
		const offsets = state.selectedFileHighlightOffset
		if (!offsets?.length) return undefined
		const unwrapped = unwrap(offsets)
		return unwrapped.map((offset) => ({
			charDelta: offset.charDelta,
			lineDelta: offset.lineDelta,
			fromCharIndex: offset.fromCharIndex,
			fromLineRow: offset.fromLineRow,
			oldEndRow: offset.oldEndRow,
			newEndRow: offset.newEndRow,
			oldEndIndex: offset.oldEndIndex,
			newEndIndex: offset.newEndIndex,
		}))
	})

	const editorErrors = createMemo(() => state.selectedFileErrors)

	createEffect(() => {
		highlightLog.debug('[SelectedFilePanel] highlight update', {
			path: state.lastKnownFilePath,
			highlightCount: editorHighlights()?.length ?? 0,
			offsetCount: editorHighlightOffset()?.length ?? 0,
			isSelected: props.isFileSelected(),
		})
	})

	// Handle settings routing - only sync when settings route is explicitly activated
	createEffect(() => {
		const isSettingsRouteOpen = settingsRoute.isSettingsOpen()
		const isSettingsSelected = isSettingsFile()
		
		// Only open settings file if:
		// 1. Settings route is active
		// 2. Settings file is not already selected
		// 3. We're not currently loading (to avoid conflicts during page restoration)
		if (isSettingsRouteOpen && !isSettingsSelected && !state.loading && !state.selectedFileLoading) {
			void selectPath('/.system/settings.json')
		}
	})

	return (
		<div class="flex h-full flex-col font-mono overflow-hidden">
			<Tabs
				values={tabsState()}
				activeValue={state.lastKnownFilePath}
				onSelect={handleTabSelect}
				onClose={handleTabClose}
				getLabel={tabLabel}
				dirtyPaths={state.dirtyPaths}
			/>

			<div
				class="relative flex-1 overflow-hidden"
				style={{ 'view-transition-name': 'editor-content' }}
			>
				<Switch
					fallback={
						<Editor
							document={editorDocument}
							isFileSelected={props.isFileSelected}
							stats={() => state.selectedFileStats}
							fontSize={() => DEFAULT_FONT_SIZE}
							fontFamily={() => DEFAULT_FONT_FAMILY}
							cursorMode={() => CursorMode.Terminal}
							registerEditorArea={(resolver) =>
								focus.registerArea('editor', resolver)
							}
							activeScopes={focus.activeScopes}
							previewBytes={() => state.selectedFilePreviewBytes}
							highlights={editorHighlights}
							highlightOffset={editorHighlightOffset}
							folds={() => state.selectedFileFolds}
							brackets={() => state.selectedFileBrackets}
							errors={editorErrors}
							treeSitterWorker={treeSitterWorker() ?? undefined}
							documentVersion={documentVersion}
							onSave={() => void saveFile()}
							initialScrollPosition={() => state.selectedFileScrollPosition}
							onScrollPositionChange={updateSelectedFileScrollPosition}
							initialVisibleContent={() => state.selectedFileVisibleContent}
							onCaptureVisibleContent={updateSelectedFileVisibleContent}
						/>
					}
				>
					<Match when={shouldShowSettings() && shouldShowJSONView()}>
						<SettingsJSONTab />
					</Match>

					<Match when={shouldShowSettings() && !shouldShowJSONView()}>
						<SettingsTab 
							initialCategory={settingsRoute.currentCategory()}
							currentCategory={settingsRoute.currentCategory()}
							onCategoryChange={(categoryId) => {
								settingsRoute.navigateToCategory(categoryId)
							}}
						/>
					</Match>

					<Match when={!props.isFileSelected()}>
						<p class="mt-2 text-sm text-zinc-500">
							{/* Select a file to view its contents. Click folders to toggle
						visibility. Click folders to toggle
						visibility. */}
						</p>
					</Match>

					{/* <Match when={isBinary()}>
						<BinaryFileViewer
							data={() => state.selectedFilePreviewBytes}
							stats={() => state.selectedFileStats}
							fileSize={() => state.selectedFileSize}
							fontSize={() => DEFAULT_FONT_SIZE}
							fontFamily={() => DEFAULT_FONT_FAMILY}
						/>
					</Match> */}
				</Switch>
			</div>
		</div>
	)
}
