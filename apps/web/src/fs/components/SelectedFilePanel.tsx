import type {
	EditorSyntaxHighlight,
	TextEditorDocument,
} from '@repo/code-editor'
import { Editor, Lexer } from '@repo/code-editor'
import {
	Accessor,
	Match,
	Switch,
	batch,
	createMemo,
	createResource,
	createSignal,
} from 'solid-js'
import { useFocusManager } from '~/focus/focusManager'
import { BinaryFileViewer } from '../../components/BinaryFileViewer'
import { useFs } from '../../fs/context/FsContext'
import { sendIncrementalTreeEdit } from '../../treeSitter/incrementalEdits'
import { getTreeSitterWorker } from '../../treeSitter/workerClient'
import { detectLanguage } from '../../workers/treeSitter/constants'
import { useTabs } from '../hooks/useTabs'
import { Tabs } from './Tabs'

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
			updateSelectedFileFolds,
			updateSelectedFileBrackets,
			updateSelectedFileErrors,
			saveFile,
		},
	] = useFs()
	const focus = useFocusManager()

	const isBinary = () => state.selectedFileStats?.contentKind === 'binary'

	const [documentVersion, setDocumentVersion] = createSignal(0)
	const [treeSitterWorker] = createResource(async () => getTreeSitterWorker())

	// Create lexer based on file extension - JS/TS lexer only for JS/TS files
	// Other file types get empty lexer (plain text) when tree-sitter unavailable
	const JS_TS_LANGUAGES = new Set(['javascript', 'jsx', 'typescript', 'tsx'])
	const editorLexer = createMemo(() => {
		const path = state.lastKnownFilePath
		if (!path) return Lexer.createEmpty()
		const languageId = detectLanguage(path)
		return languageId && JS_TS_LANGUAGES.has(languageId)
			? Lexer.create()
			: Lexer.createEmpty()
	})

	const tabs = useTabs(() => state.lastKnownFilePath, {
		maxTabs: MAX_EDITOR_TABS,
	})

	const handleTabSelect = (path: string) => {
		if (!path || path === state.selectedPath) return
		void selectPath(path)
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
		applyIncrementalEdit: (edit) => {
			if (isBinary()) return
			const path = state.lastKnownFilePath
			const parsePromise = sendIncrementalTreeEdit(path, edit)
			if (!parsePromise) return

			// Tree-sitter artifacts are async and can briefly go stale vs the live piece table.
			// Clear highlights and brackets immediately so the editor falls back to the lexer
			// until the next worker result arrives.
			// TODO make tree sitter table like zed editor
			batch(() => {
				updateSelectedFileHighlights(undefined)
				updateSelectedFileBrackets([])
			})

			void parsePromise.then((result) => {
				if (result && path === state.lastKnownFilePath) {
					batch(() => {
						updateSelectedFileHighlights(result.captures)
						updateSelectedFileFolds(result.folds)
						updateSelectedFileBrackets(result.brackets)
						updateSelectedFileErrors(result.errors)
						// Increment version to trigger minimap re-render
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
			return captures.map((capture) => ({
				startIndex: capture.startIndex,
				endIndex: capture.endIndex,
				scope: capture.captureName,
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
						registerEditorArea={(resolver) =>
							focus.registerArea('editor', resolver)
						}
						activeScopes={focus.activeScopes}
						previewBytes={() => state.selectedFilePreviewBytes}
						highlights={editorHighlights}
						folds={() => state.selectedFileFolds}
						brackets={() => state.selectedFileBrackets}
						errors={editorErrors}
						treeSitterWorker={treeSitterWorker() ?? undefined}
						lexer={editorLexer()}
						documentVersion={documentVersion}
						onSave={() => void saveFile()}
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
