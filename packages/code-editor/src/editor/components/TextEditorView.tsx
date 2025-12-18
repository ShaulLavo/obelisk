import {
	Show,
	createEffect,
	createSignal,
	onCleanup,
	type Accessor,
} from 'solid-js'
import { DEFAULT_TAB_SIZE } from '../consts'
import { useCursor } from '../cursor'
import { Lexer } from '@repo/lexer'
import {
	createCursorScrollSync,
	createMouseSelection,
	createTextEditorInput,
	createTextEditorLayout,
	createLineHighlights,
	useComputedLexerStates,
	useFoldedStarts,
	useStartBenchmark,
	useVisibleBracketDepths,
} from '../hooks'
import { EditorViewport } from './EditorViewport'
import type { BracketDepthMap, EditorProps } from '../types'

type TextEditorViewProps = EditorProps & {
	treeSitterBracketDepths: Accessor<BracketDepthMap | undefined>
}

export const TextEditorView = (props: TextEditorViewProps) => {
	const cursor = useCursor()
	const lexer = Lexer.create()

	const tabSize = () => props.tabSize?.() ?? DEFAULT_TAB_SIZE
	const [scrollElement, setScrollElement] = createSignal<HTMLDivElement | null>(
		null
	)

	useStartBenchmark({ scrollElement })

	let inputElement: HTMLTextAreaElement | null = null
	const setInputElement = (element: HTMLTextAreaElement) => {
		inputElement = element
	}

	const isEditable = () => props.document.isEditable()

	const { foldedStarts, toggleFold } = useFoldedStarts({
		filePath: () => props.document.filePath(),
		folds: () => props.folds?.(),
		scrollElement,
	})

		const layout = createTextEditorLayout({
			fontSize: () => props.fontSize(),
			fontFamily: () => props.fontFamily(),
			isFileSelected: () => props.isFileSelected(),
			tabSize,
			scrollElement,
			folds: () => props.folds?.(),
			foldedStarts,
		})

	const cursorScroll = createCursorScrollSync({
		scrollElement,
		lineHeight: layout.lineHeight,
		charWidth: layout.charWidth,
		getColumnOffset: layout.getColumnOffset,
	})

	const scrollCursorIntoView = () => {
		const pos = cursor.state.position
		cursorScroll.scrollToCursor(pos.line, pos.column)
	}

	const input = createTextEditorInput({
		visibleLineRange: layout.visibleLineRange,
		updatePieceTable: (updater) => props.document.updatePieceTable(updater),
		isFileSelected: () => props.isFileSelected(),
		isEditable,
		getInputElement: () => inputElement,
		scrollCursorIntoView,
		activeScopes: () => props.activeScopes?.() ?? ['editor', 'global'],
		onIncrementalEdit: (edit) => props.document.applyIncrementalEdit?.(edit),
	})

	const mouseSelection = createMouseSelection({
		scrollElement,
		charWidth: layout.charWidth,
		tabSize,
		lineHeight: layout.lineHeight,
	})

	const handleLineMouseDown = (
		event: MouseEvent,
		lineIndex: number,
		column: number
	) => {
		mouseSelection.handleMouseDown(event, lineIndex, column)
		if (isEditable()) input.focusInput()
	}

	createEffect(() => {
		const element = scrollElement()
		if (!element) return

		const unregister = props.registerEditorArea?.(() => element)
		if (typeof unregister === 'function') {
			onCleanup(unregister)
		}
	})

	const lexerStates = useComputedLexerStates({
		lexer,
		lexerLineStates: () => props.lexerLineStates?.(),
		content: () => props.document.content(),
	})

	const bracketDepths = useVisibleBracketDepths({
		lexer,
		treeSitterBracketDepths: () => props.treeSitterBracketDepths(),
		lexerStates,
		virtualItems: layout.virtualItems,
		displayToLine: layout.displayToLine,
		getLineText: (lineIndex) => cursor.lines.getLineText(lineIndex),
	})

	const { getLineHighlights } = createLineHighlights({
		lexer,
		highlights: () => props.highlights?.(),
		errors: () => props.errors?.(),
	})

	return (
		<Show
			when={layout.hasLineEntries()}
			fallback={
				<p class="mt-4 text-sm text-zinc-500">
					Line information is not available for this file yet.
				</p>
			}
		>
			<EditorViewport
				setScrollElement={setScrollElement}
				setInputElement={setInputElement}
				layout={layout}
				input={input}
				isEditable={isEditable}
				fontSize={props.fontSize}
				fontFamily={props.fontFamily}
				cursorMode={props.cursorMode}
				tabSize={tabSize}
				bracketDepths={bracketDepths}
				getLineHighlights={getLineHighlights}
				folds={props.folds}
				foldedStarts={foldedStarts}
				onToggleFold={toggleFold}
				onLineMouseDown={(event, lineIndex, column) =>
					handleLineMouseDown(event, lineIndex, column)
				}
			/>
		</Show>
	)
}
