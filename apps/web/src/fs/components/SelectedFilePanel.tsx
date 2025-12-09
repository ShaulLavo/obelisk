import type {
	EditorSyntaxHighlight,
	TextEditorDocument
} from '@repo/code-editor'
import { Editor } from '@repo/code-editor'
import { Accessor, Match, Switch, createMemo } from 'solid-js'
import { useFocusManager } from '~/focus/focusManager'
import { BinaryFileViewer } from '../../components/BinaryFileViewer'
import { useFs } from '../../fs/context/FsContext'
import { sendIncrementalTreeEdit } from '../../treeSitter/incrementalEdits'
import { useTabs } from '../hooks/useTabs'
import { Tabs } from './Tabs'

const FONT_OPTIONS = [
	{
		label: 'JetBrains Mono',
		value: '"JetBrains Mono Variable", monospace'
	},
	{
		label: 'Geist Mono',
		value: '"Geist Mono", monospace'
	}
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
		{ selectPath, updateSelectedFilePieceTable, updateSelectedFileHighlights, updateSelectedFileBrackets, updateSelectedFileErrors }
	] = useFs()
	const focus = useFocusManager()
	// const [fontSize, setFontSize] = createSignal(DEFAULT_FONT_SIZE)
	// const [fontFamily, setFontFamily] = createSignal(DEFAULT_FONT_FAMILY)
	// const [cursorMode, setCursorMode] = makePersisted(
	// 	// eslint-disable-next-line solid/reactivity
	// 	createSignal<CursorMode>('regular'),
	// 	{ name: 'editor-cursor-mode' }
	// )

	const isBinary = () => state.selectedFileStats?.contentKind === 'binary'

	// const handleFontSizeInput: JSX.EventHandlerUnion<
	// 	HTMLInputElement,
	// 	InputEvent
	// > = event => {
	// 	const next = event.currentTarget.valueAsNumber
	// 	setFontSize(Number.isNaN(next) ? DEFAULT_FONT_SIZE : next)
	// }

	// const resetFontControls = () => {
	// 	setFontSize(DEFAULT_FONT_SIZE)
	// 	setFontFamily(DEFAULT_FONT_FAMILY)
	// }

	// const toggleCursorMode = () => {
	// 	setCursorMode(mode => (mode === 'regular' ? 'terminal' : 'regular'))
	// }

	// const cursorModeLabel = createMemo(() =>
	// 	cursorMode() === 'terminal' ? 'Terminal' : 'Regular'
	// )

	const tabs = useTabs(() => state.lastKnownFilePath, {
		maxTabs: MAX_EDITOR_TABS
	})

	const handleTabSelect = (path: string) => {
		if (!path || path === state.selectedPath) return
		void selectPath(path, { forceReload: true })
	}

	const tabLabel = (path: string) => path.split('/').pop() || path

	const isEditable = () =>
		props.isFileSelected() && !state.selectedFileLoading && !state.loading

	const editorDocument: TextEditorDocument = {
		filePath: () => state.lastKnownFilePath,
		content: () => state.selectedFileContent,
		pieceTable: () => state.selectedFilePieceTable,
		updatePieceTable: updateSelectedFilePieceTable,
		isEditable,
		applyIncrementalEdit: edit => {
			if (isBinary()) return
			const path = state.lastKnownFilePath
			const parsePromise = sendIncrementalTreeEdit(path, edit)
			if (!parsePromise) return
			void parsePromise.then(result => {
				// Ignore highlights if file changed while computing
				if (result && path === state.lastKnownFilePath) {
					updateSelectedFileHighlights(result.captures)
					updateSelectedFileBrackets(result.brackets)
					updateSelectedFileErrors(result.errors)
				}
			})
		}
	}

	const editorHighlights = createMemo<EditorSyntaxHighlight[] | undefined>(
		() => {
			const captures = state.selectedFileHighlights
			if (!captures || captures.length === 0) {
				return undefined
			}
			return captures.map(capture => ({
				startIndex: capture.startIndex,
				endIndex: capture.endIndex,
				scope: capture.captureName
			}))
		}
	)

	
	const editorErrors = createMemo(() => state.selectedFileErrors)

	return (
		<div class="flex h-full flex-col font-mono overflow-hidden">
			<Tabs
				values={tabs()}
				activeValue={state.lastKnownFilePath}
				onSelect={handleTabSelect}
				getLabel={tabLabel}
			/>

			<Switch
				fallback={
					<Editor
						document={editorDocument}
						isFileSelected={props.isFileSelected}
						stats={() => state.selectedFileStats}
						fontSize={() => DEFAULT_FONT_SIZE}
						fontFamily={() => DEFAULT_FONT_FAMILY}
						cursorMode={() => 'regular'}
						registerEditorArea={resolver =>
							focus.registerArea('editor', resolver)
						}
						activeScopes={focus.activeScopes}
						previewBytes={() => state.selectedFilePreviewBytes}
						highlights={editorHighlights}
						brackets={() => state.selectedFileBrackets}
						errors={editorErrors}
					/>
				}
			>
				<Match when={!props.isFileSelected()}>
					<p class="mt-2 text-sm text-zinc-500">
						{/* Select a file to view its contents. Click folders to toggle
						visibility. */}
					</p>
				</Match>

				<Match when={isBinary()}>
					<BinaryFileViewer
						data={() => state.selectedFilePreviewBytes}
						stats={() => state.selectedFileStats}
						fileSize={() => state.selectedFileSize}
						fontSize={() => DEFAULT_FONT_SIZE}
						fontFamily={() => DEFAULT_FONT_FAMILY}
					/>
				</Match>
			</Switch>
		</div>
	)
}
