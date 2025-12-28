import { For, createMemo } from 'solid-js'
import { EDITOR_PADDING_LEFT } from '../../consts'
import type { FoldRange, LineGuttersProps } from '../../types'
import { LineGutterItem } from './LineGutterItem'

export const LineGutters = (props: LineGuttersProps) => {
	const handleRowMouseDown = (event: MouseEvent, lineIndex: number) => {
		if (
			event.button !== 0 ||
			event.shiftKey ||
			event.ctrlKey ||
			event.metaKey
		) {
			return
		}

		const selection = window.getSelection()
		if (selection && !selection.isCollapsed) {
			return
		}

		props.onRowClick(lineIndex)
	}

	const foldMap = createMemo(() => {
		const folds = props.folds?.()
		const map = new Map<number, FoldRange>()
		if (!folds) return map
		for (const fold of folds) {
			if (fold.endLine <= fold.startLine) continue
			const existing = map.get(fold.startLine)
			if (!existing || fold.endLine > existing.endLine) {
				map.set(fold.startLine, fold)
			}
		}
		return map
	})

	return (
		<div
			class="editor-gutter-wrapper"
			style={{
				width: `${props.gutterWidth()}px`,
			}}
		>
			<div
				class="relative h-full"
				style={{
					'padding-left': `${EDITOR_PADDING_LEFT}px`,
				}}
			>
				<For each={props.rows()}>
					{(virtualRow) => (
						<LineGutterItem
							virtualRow={virtualRow}
							displayToLine={props.displayToLine}
							lineHeight={props.lineHeight}
							activeLineIndex={props.activeLineIndex}
							foldMap={foldMap}
							foldedStarts={props.foldedStarts}
							onToggleFold={props.onToggleFold}
							onRowMouseDown={handleRowMouseDown}
						/>
					)}
				</For>
			</div>
		</div>
	)
}
