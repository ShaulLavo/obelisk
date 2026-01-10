import { CursorMode, Editor } from '@repo/code-editor'
import { Accessor, Match, Switch, createMemo, createResource } from 'solid-js'
import { useFocusManager } from '~/focus/focusManager'
import { useFs } from '../../fs/context/FsContext'
import { useSettings } from '~/settings/SettingsProvider'

import { getTreeSitterWorker } from '../../treeSitter/workerClient'

import { Tabs } from './Tabs'
import { ViewModeToggle } from './ViewModeToggle'
import { SettingsTab } from '../../settings/components/SettingsTab'
import { BinaryFileViewer } from '~/components/BinaryFileViewer'
import { useEditorDecorations } from '../hooks/useEditorDecorations'
import { useEditorDocument } from '../hooks/useEditorDocument'
import { useSelectedFileTabs } from '../hooks/useSelectedFileTabs'
import { useSettingsViewState } from '../hooks/useSettingsViewState'
import { detectAvailableViewModes } from '../utils/viewModeDetection'
import { viewModeRegistry } from '../registry/ViewModeRegistry'
import { type ViewMode } from '../types/TabIdentity'

const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = "'JetBrains Mono Variable', monospace"
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
			setViewMode,
			saveFile,
			fileCache,
		},
	] = useFs()
	const focus = useFocusManager()
	const [settingsState] = useSettings()

	const editorFontSize = createMemo(() => {
		const value = settingsState.values['editor.fontSize']
		if (typeof value === 'number') return value

		const fallback = settingsState.defaults['editor.fontSize']
		if (typeof fallback === 'number') return fallback

		return DEFAULT_FONT_SIZE
	})

	const editorFontFamily = createMemo(() => {
		const value = settingsState.values['editor.fontFamily']
		if (typeof value === 'string' && value.trim().length > 0) return value

		const fallback = settingsState.defaults['editor.fontFamily']
		if (typeof fallback === 'string' && fallback.trim().length > 0) {
			return fallback
		}

		return DEFAULT_FONT_FAMILY
	})

	const settingsView = useSettingsViewState({
		selectedPath: () => state.selectedPath,
	})

	const [treeSitterWorker] = createResource(async () => getTreeSitterWorker())

	const {
		tabsState,
		handleTabSelect,
		handleTabClose,
		tabLabel,
		getTabTooltip,
	} = useSelectedFileTabs({
		currentPath: () => state.lastKnownFilePath,
		selectedPath: () => state.selectedPath,
		selectPath,
		setOpenTabs: fileCache.setOpenTabs,
		shouldShowJSONView: settingsView.shouldShowJSONView,
		maxTabs: MAX_EDITOR_TABS,
	})

	// Create the current tab ID for the active tab (now just the file path)
	const currentTabId = () => {
		return state.lastKnownFilePath
	}

	const { editorDocument, documentVersion } = useEditorDocument({
		filePath: () => state.lastKnownFilePath,
		content: () => state.selectedFileContent,
		pieceTable: () => state.selectedFilePieceTable,
		updatePieceTable: updateSelectedFilePieceTable,
		isFileSelected: () => props.isFileSelected(),
		isSelectedFileLoading: () => state.selectedFileLoading,
		isLoading: () => state.loading,
		stats: () => state.selectedFileStats,
		applyHighlightOffset: applySelectedFileHighlightOffset,
		updateHighlights: updateSelectedFileHighlights,
		updateFolds: updateSelectedFileFolds,
		updateBrackets: updateSelectedFileBrackets,
		updateErrors: updateSelectedFileErrors,
	})

	const { editorHighlights, editorHighlightOffset, editorErrors } =
		useEditorDecorations({
			highlights: () => state.selectedFileHighlights,
			highlightOffsets: () => state.selectedFileHighlightOffset,
			errors: () => state.selectedFileErrors,
			isFileSelected: () => props.isFileSelected(),
			filePath: () => state.lastKnownFilePath,
		})

	// Create a mapping from tab IDs to dirty status (tab IDs are now just file paths)
	const tabDirtyStatus = () => {
		const dirtyStatus: Record<string, boolean> = {}
		for (const tabId of tabsState()) {
			// Tab ID is now just the file path
			dirtyStatus[tabId] = !!state.dirtyPaths[tabId]
		}
		return dirtyStatus
	}

	// Handle view mode switching - switches mode on same tab
	const handleViewModeSelect = (newViewMode: ViewMode) => {
		const currentPath = state.lastKnownFilePath
		if (!currentPath) return

		console.log(
			'handleViewModeSelect called:',
			JSON.stringify({ currentPath, newViewMode }, null, 2)
		)

		// Set the view mode using the new system
		setViewMode(currentPath, newViewMode)
	}

	// Get current view mode and available modes for the toggle
	const getCurrentViewMode = (): ViewMode => {
		// Use the new view mode system
		const currentMode = state.selectedFileViewMode || 'editor'
		console.log(
			'getCurrentViewMode:',
			JSON.stringify(
				{
					path: state.lastKnownFilePath,
					currentMode,
					selectedFileViewMode: state.selectedFileViewMode,
				},
				null,
				2
			)
		)
		return currentMode
	}

	const getAvailableViewModesForCurrentFile = () => {
		const currentPath = state.lastKnownFilePath
		if (!currentPath) return []

		const availableModes = detectAvailableViewModes(
			currentPath,
			state.selectedFileStats
		)
		return availableModes
			.map((mode) => viewModeRegistry.getViewMode(mode))
			.filter((mode): mode is NonNullable<typeof mode> => mode !== undefined)
	}

	return (
		<div class="flex h-full flex-col font-mono overflow-hidden">
			<Tabs
				values={tabsState()}
				activeValue={currentTabId()}
				onSelect={handleTabSelect}
				onClose={handleTabClose}
				getLabel={tabLabel}
				getTooltip={getTabTooltip}
				dirtyPaths={tabDirtyStatus()}
				rightSlot={() => (
					<ViewModeToggle
						currentPath={state.lastKnownFilePath || ''}
						currentViewMode={getCurrentViewMode()}
						availableModes={getAvailableViewModesForCurrentFile()}
						onModeSelect={handleViewModeSelect}
					/>
				)}
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
							fontSize={editorFontSize}
							fontFamily={editorFontFamily}
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
					{/* Settings file in UI mode (Requirements 3.2) */}
					<Match when={getCurrentViewMode() === 'ui'}>
						<SettingsTab
							initialCategory={settingsView.currentCategory()}
							currentCategory={settingsView.currentCategory()}
							onCategoryChange={settingsView.handleCategoryChange}
						/>
					</Match>

					{/* Binary file in binary mode (Requirements 4.2) */}
					<Match
						when={
							state.selectedFileStats?.contentKind === 'binary' &&
							getCurrentViewMode() === 'binary'
						}
					>
						<BinaryFileViewer
							data={() => state.selectedFilePreviewBytes}
							stats={() => state.selectedFileStats}
							fileSize={() => state.selectedFileSize}
							fontSize={editorFontSize}
							fontFamily={editorFontFamily}
						/>
					</Match>

					<Match when={!props.isFileSelected()}>
						<p class="mt-2 text-sm text-zinc-500">
							{/* Select a file to view its contents. Click folders to toggle
						visibility. Click folders to toggle
						visibility. */}
						</p>
					</Match>
				</Switch>
			</div>
		</div>
	)
}
