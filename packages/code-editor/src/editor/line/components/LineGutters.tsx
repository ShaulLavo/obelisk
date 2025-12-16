import { For, Show, createMemo } from 'solid-js'
import { EDITOR_PADDING_LEFT, LINE_NUMBER_WIDTH } from '../../consts'
import { useCursor } from '../../cursor'
import type { FoldRange, LineGuttersProps } from '../../types'
import { LineGutter } from './LineGutter'

export const LineGutters = (props: LineGuttersProps) => {
	const cursor = useCursor()
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
			class="sticky left-0 z-10 bg-zinc-950"
			style={{
				width: `${LINE_NUMBER_WIDTH}px`,
			}}
		>
			<div
				class="relative h-full"
				style={{
					'padding-left': `${EDITOR_PADDING_LEFT}px`,
				}}
			>
				<For each={props.rows()}>
					{(virtualRow) => {
						const lineIndex = createMemo(() =>
							props.displayToLine
								? props.displayToLine(virtualRow.index)
								: virtualRow.index
						)

						const isValidLine = createMemo(
							() => lineIndex() >= 0 && lineIndex() < cursor.lines.lineCount()
						)

						const height = createMemo(
							() => virtualRow.size || props.lineHeight()
						)
						const isActive = createMemo(
							() => props.activeLineIndex() === lineIndex()
						)
						const hasFold = createMemo(() => foldMap().has(lineIndex()))
						const isFolded = createMemo(
							() => props.foldedStarts?.()?.has(lineIndex()) ?? false
						)

						return (
							<Show when={isValidLine()}>
								<div
									data-index={virtualRow.index}
									data-line={lineIndex()}
									class="absolute left-0 right-0"
									style={{
										transform: `translateY(${virtualRow.start}px)`,
										top: 0,
										height: `${height()}px`,
									}}
								>
									<div
										class="relative flex h-full items-center justify-end"
										onMouseDown={(event) =>
											handleRowMouseDown(event, lineIndex())
										}
									>
										<LineGutter
											lineNumber={lineIndex() + 1}
											lineHeight={height()}
											isActive={isActive()}
											isFoldable={hasFold()}
											isFolded={isFolded()}
											onFoldClick={() =>
												hasFold() && props.onToggleFold?.(lineIndex())
											}
										/>
									</div>
								</div>
							</Show>
						)
					}}
				</For>
			</div>
		</div>
	)
}
