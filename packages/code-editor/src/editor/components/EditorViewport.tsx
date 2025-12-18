import { Show, type Accessor } from 'solid-js'
import { Lines } from '../line/components/Lines'
import { Cursor } from '../cursor/components/Cursor'
import { SelectionLayer } from '../selection/components/SelectionLayer'
import { LineGutters } from '../line/components/LineGutters'
import { Input } from './Input'
import { LINE_NUMBER_WIDTH } from '../consts'
import type { TextEditorLayout, TextEditorInputHandlers } from '../hooks'
import type {
	BracketDepthMap,
	CursorMode,
	FoldRange,
	LineEntry,
	LineHighlightSegment,
} from '../types'

type EditorViewportProps = {
	setScrollElement: (element: HTMLDivElement) => void
	setInputElement: (element: HTMLTextAreaElement) => void
	layout: TextEditorLayout
	input: TextEditorInputHandlers
	isEditable: Accessor<boolean>
	fontSize: Accessor<number>
	fontFamily: Accessor<string>
	cursorMode: Accessor<CursorMode>
	tabSize: Accessor<number>
	bracketDepths: Accessor<BracketDepthMap | undefined>
	getLineHighlights: (entry: LineEntry) => LineHighlightSegment[] | undefined
	folds?: Accessor<FoldRange[] | undefined>
	foldedStarts: Accessor<Set<number>>
	onToggleFold: (startLine: number) => void
	onLineMouseDown: (
		event: MouseEvent,
		lineIndex: number,
		column: number,
		textElement: HTMLElement | null
	) => void
}

export const EditorViewport = (props: EditorViewportProps) => {
	return (
		<div
			ref={props.setScrollElement}
			class="relative  flex-1 overflow-auto   bg-zinc-950/30"
			style={{
				'font-size': `${props.fontSize()}px`,
				'font-family': props.fontFamily(),
				'user-select': 'none',
			}}
			onClick={() => props.input.focusInput()}
		>
			<Input
				inputRef={props.setInputElement}
				layout={props.layout}
				isEditable={props.isEditable}
				onInput={props.input.handleInput}
				onKeyDown={props.input.handleKeyDown}
				onKeyUp={props.input.handleKeyUp}
			/>

			<div
				style={{
					height: `${props.layout.totalSize()}px`,
					position: 'relative',
				}}
			>
				<SelectionLayer
					virtualItems={props.layout.virtualItems}
					lineHeight={props.layout.lineHeight}
					lineNumberWidth={LINE_NUMBER_WIDTH}
					paddingLeft={0}
					charWidth={props.layout.charWidth}
					tabSize={props.tabSize}
					getColumnOffset={props.layout.getColumnOffset}
					getLineY={props.layout.getLineY}
				/>

				<Show when={props.isEditable()}>
					<Cursor
						fontSize={props.fontSize()}
						fontFamily={props.fontFamily()}
						charWidth={props.layout.charWidth()}
						lineNumberWidth={LINE_NUMBER_WIDTH}
						paddingLeft={0}
						visibleLineStart={props.layout.visibleLineRange().start}
						visibleLineEnd={props.layout.visibleLineRange().end}
						getColumnOffset={props.layout.getColumnOffset}
						getLineY={props.layout.getLineY}
						cursorMode={props.cursorMode}
					/>
				</Show>

				<div class="flex h-full">
					<LineGutters
						rows={props.layout.virtualItems}
						lineHeight={props.layout.lineHeight}
						onRowClick={props.input.handleRowClick}
						activeLineIndex={props.layout.activeLineIndex}
						folds={props.folds}
						foldedStarts={props.foldedStarts}
						onToggleFold={props.onToggleFold}
						displayToLine={props.layout.displayToLine}
					/>

					<Lines
						rows={props.layout.virtualItems}
						contentWidth={props.layout.contentWidth}
						lineHeight={props.layout.lineHeight}
						charWidth={props.layout.charWidth}
						tabSize={props.tabSize}
						isEditable={props.isEditable}
						onPreciseClick={props.input.handlePreciseClick}
						onMouseDown={props.onLineMouseDown}
						activeLineIndex={props.layout.activeLineIndex}
						bracketDepths={props.bracketDepths}
						getLineHighlights={props.getLineHighlights}
						displayToLine={props.layout.displayToLine}
					/>
				</div>
			</div>
		</div>
	)
}

