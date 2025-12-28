import { Accessor, Show, createMemo } from 'solid-js'
import { useCursor } from '../../cursor'
import { FoldRange, VirtualItem2D } from '../../types'
import { LineGutter } from './LineGutter'

export interface LineGutterItemProps {
	virtualRow: VirtualItem2D
	displayToLine?: (index: number) => number
	lineHeight: Accessor<number>
	activeLineIndex: Accessor<number | null>
	foldMap: Accessor<Map<number, FoldRange>>
	foldedStarts?: Accessor<Set<number>>
	onToggleFold?: (lineIndex: number) => void
	onRowMouseDown: (event: MouseEvent, lineIndex: number) => void
}

export const LineGutterItem = (props: LineGutterItemProps) => {
	const cursor = useCursor()

	const lineIndex = createMemo(() => {
		const lineId = props.virtualRow.lineId
		if (lineId > 0) {
			const resolved = cursor.lines.getLineIndex(lineId)
			if (resolved >= 0) return resolved
		}

		return props.displayToLine
			? props.displayToLine(props.virtualRow.index)
			: props.virtualRow.index
	})

	const isValidLine = createMemo(
		() => lineIndex() >= 0 && lineIndex() < cursor.lines.lineCount()
	)

	const height = createMemo(() => props.virtualRow.size || props.lineHeight())
	const isActive = createMemo(() => props.activeLineIndex() === lineIndex())
	const hasFold = createMemo(() => props.foldMap().has(lineIndex()))
	const isFolded = createMemo(
		() => props.foldedStarts?.()?.has(lineIndex()) ?? false
	)

	return (
		<Show when={isValidLine()}>
			<div
				data-index={props.virtualRow.index}
				data-line={lineIndex()}
				class="editor-gutter-row"
				style={{
					transform: `translateY(${props.virtualRow.start}px)`,
					top: 0,
					height: `${height()}px`,
				}}
				onMouseDown={(event) => props.onRowMouseDown(event, lineIndex())}
			>
				<LineGutter
					lineNumber={lineIndex() + 1}
					lineHeight={height()}
					isActive={isActive()}
					isFoldable={hasFold()}
					isFolded={isFolded()}
					onFoldClick={() => hasFold() && props.onToggleFold?.(lineIndex())}
				/>
			</div>
		</Show>
	)
}
