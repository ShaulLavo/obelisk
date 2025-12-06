import type { TextEditorDocument } from '@repo/code-editor'
import { Editor } from '@repo/code-editor'
import { Accessor, Match, Switch, createMemo } from 'solid-js'
import { useFocusManager } from '~/focus/focusManager'
import { BinaryFileViewer } from '../../components/BinaryFileViewer'
import { useFs } from '../../fs/context/FsContext'

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

type SelectedFilePanelProps = {
	isFileSelected: Accessor<boolean>
	currentPath?: string
}

export const SelectedFilePanel = (props: SelectedFilePanelProps) => {
	const [state, { updateSelectedFilePieceTable }] = useFs()
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

	const isEditable = () =>
		props.isFileSelected() && !state.selectedFileLoading && !state.loading

	const editorDocument: TextEditorDocument = {
		filePath: () => state.lastKnownFilePath,
		content: () => state.selectedFileContent,
		pieceTable: () => state.selectedFilePieceTable,
		updatePieceTable: updateSelectedFilePieceTable,
		isEditable
	}

	const currentFileLabel = createMemo(() => {
		const path = props.currentPath
		if (!path) return 'No file selected'
		return path.split('/').pop() || 'No file selected'
	})

	return (
		<div class="flex h-full flex-col font-mono overflow-hidden">
			<p class="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
				{currentFileLabel()}
			</p>

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
					/>
				}
			>
				<Match when={!props.isFileSelected()}>
					<p class="mt-2 text-sm text-zinc-500">
						Select a file to view its contents. Click folders to toggle
						visibility.
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
