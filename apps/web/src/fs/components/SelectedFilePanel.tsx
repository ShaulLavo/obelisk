import { CursorMode, Editor } from '@repo/code-editor'
import {
	Accessor,
	Match,
	Switch,
	createMemo,
	createResource,
	createSignal,
} from 'solid-js'
import { useFocusManager } from '~/focus/focusManager'
import { useFs } from '../../fs/context/FsContext'
import { useSettings } from '~/settings/SettingsProvider'
import { Flex } from '@repo/ui/flex'

import { getTreeSitterWorker } from '../../treeSitter/workerClient'

import { Tabs } from './Tabs'
import { ViewModeToggle } from './ViewModeToggle'
import { SettingsTab } from '../../settings/components/SettingsTab'
import { BinaryFileViewer } from '~/components/BinaryFileViewer'
import { useEditorDecorations } from '../hooks/useEditorDecorations'
import { useEditorDocument } from '../hooks/useEditorDocument'
import { useSelectedFileTabs } from '../hooks/useSelectedFileTabs'
import {
	detectAvailableViewModes,
	getValidViewMode,
} from '../utils/viewModeDetection'
import { viewModeRegistry } from '../registry/ViewModeRegistry'
import { type ViewMode } from '../types/ViewMode'

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
		const value = settingsState.values['editor.font.size']
		if (typeof value === 'number') return value

		const fallback = settingsState.defaults['editor.font.size']
		if (typeof fallback === 'number') return fallback

		return DEFAULT_FONT_SIZE
	})

	const editorFontFamily = createMemo(() => {
		const value = settingsState.values['editor.font.family']
		if (typeof value === 'string' && value.trim().length > 0) return value

		const fallback = settingsState.defaults['editor.font.family']
		if (typeof fallback === 'string' && fallback.trim().length > 0) {
			return fallback
		}

		return DEFAULT_FONT_FAMILY
	})

	const [treeSitterWorker] = createResource(async () => getTreeSitterWorker())

	// Settings category state (simple local state)
	const [currentCategory, setCurrentCategory] = createSignal<string>('editor')

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

	const getTabViewMode = (tabPath: string): ViewMode => {
		if (tabPath === state.lastKnownFilePath) {
			return currentViewMode()
		}
		// For other tabs, we need to get their stored view mode with error handling
		const stats =
			state.fileStats[tabPath.startsWith('/') ? tabPath.slice(1) : tabPath]
		const storedMode =
			state.fileViewModes[tabPath.startsWith('/') ? tabPath.slice(1) : tabPath]
		const requestedMode =
			storedMode || viewModeRegistry.getDefaultMode(tabPath, stats)

		// Ensure the view mode is valid for this file
		return getValidViewMode(requestedMode, tabPath, stats)
	}

	const getTabAvailableViewModes = (tabPath: string): ViewMode[] => {
		const stats =
			state.fileStats[tabPath.startsWith('/') ? tabPath.slice(1) : tabPath]
		return detectAvailableViewModes(tabPath, stats)
	}

	const handleViewModeSelect = (newViewMode: ViewMode) => {
		const currentPath = state.lastKnownFilePath
		if (!currentPath) return

		// Validate the requested view mode and fallback if unavailable (error handling)
		const validViewMode = getValidViewMode(
			newViewMode,
			currentPath,
			state.selectedFileStats
		)

		setViewMode(currentPath, validViewMode)
	}

	const currentViewMode = createMemo((): ViewMode => {
		const currentPath = state.lastKnownFilePath
		if (!currentPath) return 'editor'

		const requestedMode = state.selectedFileViewMode || 'editor'
		return getValidViewMode(requestedMode, currentPath, state.selectedFileStats)
	})

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
		<Flex flexDirection="col" class="h-full font-mono overflow-hidden">
			<Tabs
				values={tabsState()}
				activeValue={currentTabId()}
				onSelect={handleTabSelect}
				onClose={handleTabClose}
				getLabel={tabLabel}
				getTooltip={getTabTooltip}
				getViewMode={getTabViewMode}
				getAvailableViewModes={getTabAvailableViewModes}
				dirtyPaths={tabDirtyStatus()}
				rightSlot={() => (
					<ViewModeToggle
						currentPath={state.lastKnownFilePath || ''}
						currentViewMode={currentViewMode()}
						availableModes={getAvailableViewModesForCurrentFile()}
						onModeSelect={handleViewModeSelect}
					/>
				)}
			/>

			<Flex
				flexDirection="col"
				alignItems="stretch"
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
					<Match when={currentViewMode() === 'ui'}>
						<SettingsTab
							initialCategory={currentCategory()}
							currentCategory={currentCategory()}
							onCategoryChange={setCurrentCategory}
						/>
					</Match>

					<Match
						when={
							state.selectedFileStats?.contentKind === 'binary' &&
							currentViewMode() === 'binary'
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
						<p class="mt-2 text-ui text-zinc-500"></p>
					</Match>
				</Switch>
			</Flex>
		</Flex>
	)
}
