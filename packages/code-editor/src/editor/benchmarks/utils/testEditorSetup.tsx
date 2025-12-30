// Test editor setup utilities for browser benchmarks
import { createSignal, type JSX } from 'solid-js'
import { render } from 'vitest-browser-solid'
import { createPieceTableSnapshot, type PieceTableSnapshot } from '@repo/utils'
import { ColorModeProvider } from '@kobalte/core'
import { ThemeProvider } from '@repo/theme'
import { Editor } from '../../components/Editor'
import type {
	TextEditorDocument,
	EditorSyntaxHighlight,
	FoldRange,
	BracketInfo,
	EditorError,
	HighlightOffsets,
} from '../../types'
import { CursorMode } from '../../types'

export type TestEditorConfig = {
	content: string
	filePath?: string
	fontSize?: number
	fontFamily?: string
	tabSize?: number
	cursorMode?: CursorMode
	highlights?: EditorSyntaxHighlight[]
	brackets?: BracketInfo[]
	folds?: FoldRange[]
	errors?: EditorError[]
	width?: number
	height?: number
}

export type TestEditorHandle = {
	container: HTMLDivElement
	getScrollElement: () => HTMLElement | null
	getInputElement: () => HTMLTextAreaElement | null
	setHighlights: (highlights: EditorSyntaxHighlight[] | undefined) => void
	setHighlightOffsets: (offsets: HighlightOffsets | undefined) => void
	setContent: (content: string) => void
	getContent: () => string
	unmount: () => void
	focus: () => void
}

const createTestDocument = (
	initialContent: string,
	filePath: string
): {
	document: TextEditorDocument
	setContent: (content: string) => void
	getContent: () => string
} => {
	const [content, setContentSignal] = createSignal(initialContent)
	const [pieceTable, setPieceTable] = createSignal<
		PieceTableSnapshot | undefined
	>(createPieceTableSnapshot(initialContent))

	const document: TextEditorDocument = {
		filePath: () => filePath,
		content,
		pieceTable,
		updatePieceTable: (updater) => {
			setPieceTable(updater(pieceTable()))
		},
		isEditable: () => true,
	}

	const setContent = (newContent: string) => {
		setContentSignal(newContent)
		setPieceTable(createPieceTableSnapshot(newContent))
	}

	return { document, setContent, getContent: content }
}

export const createTestEditor = (
	config: TestEditorConfig
): TestEditorHandle => {
	const {
		content,
		filePath = 'test.ts',
		fontSize = 14,
		fontFamily = 'monospace',
		tabSize = 4,
		cursorMode = CursorMode.Regular,
		highlights: initialHighlights,
		brackets: initialBrackets,
		folds: initialFolds,
		errors: initialErrors,
		width = 800,
		height = 600,
	} = config

	const container = document.createElement('div')
	container.style.cssText = `
		width: ${width}px;
		height: ${height}px;
		position: fixed;
		top: 0;
		left: 0;
		display: flex;
		flex-direction: column;
	`
	container.setAttribute('data-testid', 'test-editor-container')
	document.body.appendChild(container)

	const {
		document: testDoc,
		setContent,
		getContent,
	} = createTestDocument(content, filePath)
	const [isFileSelected] = createSignal(true)
	const [fontSizeSignal] = createSignal(fontSize)
	const [fontFamilySignal] = createSignal(fontFamily)
	const [cursorModeSignal] = createSignal<CursorMode>(cursorMode)
	const [stats] = createSignal(undefined)
	const [tabSizeSignal] = createSignal(tabSize)

	const [highlights, setHighlights] = createSignal<
		EditorSyntaxHighlight[] | undefined
	>(initialHighlights)
	const [highlightOffsets, setHighlightOffsets] = createSignal<
		HighlightOffsets | undefined
	>(undefined)
	const [brackets] = createSignal<BracketInfo[] | undefined>(initialBrackets)
	const [folds] = createSignal<FoldRange[] | undefined>(initialFolds)
	const [errors] = createSignal<EditorError[] | undefined>(initialErrors)

	const TestEditorComponent = (): JSX.Element => (
		<ColorModeProvider>
			<ThemeProvider>
				<Editor
					document={testDoc}
					isFileSelected={isFileSelected}
					stats={stats}
					fontSize={fontSizeSignal}
					fontFamily={fontFamilySignal}
					cursorMode={cursorModeSignal}
					tabSize={tabSizeSignal}
					highlights={highlights}
					highlightOffset={highlightOffsets}
					brackets={brackets}
					folds={folds}
					errors={errors}
				/>
			</ThemeProvider>
		</ColorModeProvider>
	)

	const { unmount } = render(() => <TestEditorComponent />, { container })

	const getScrollElement = (): HTMLElement | null => {
		return container.querySelector('.editor-viewport-scroll')
	}

	const getInputElement = (): HTMLTextAreaElement | null => {
		return container.querySelector('textarea')
	}

	const focus = () => {
		const input = getInputElement()
		if (input) input.focus()
	}

	const cleanup = () => {
		unmount()
		container.remove()
	}

	return {
		container,
		getScrollElement,
		getInputElement,
		setHighlights,
		setHighlightOffsets,
		setContent,
		getContent,
		unmount: cleanup,
		focus,
	}
}

export const waitForEditorReady = async (
	handle: TestEditorHandle,
	timeout: number = 5000
): Promise<void> => {
	const start = Date.now()

	while (Date.now() - start < timeout) {
		const scroll = handle.getScrollElement()
		const input = handle.getInputElement()

		if (scroll && input && scroll.scrollHeight > 0) {
			await new Promise((resolve) => requestAnimationFrame(resolve))
			return
		}

		await new Promise((resolve) => setTimeout(resolve, 50))
	}

	throw new Error('Editor did not become ready within timeout')
}
