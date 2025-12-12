/* eslint-disable solid/prefer-for */
import { createMemo } from 'solid-js'
import { EDITOR_PADDING_LEFT, LINE_NUMBER_WIDTH } from '../../consts'
import { useCursor } from '../../cursor'
import type { FoldRange, LineEntry, LineGuttersProps } from '../../types'
import { LineGutter } from './LineGutter'

export const LineGutters = (props: LineGuttersProps) => {
	const cursor = useCursor()
	const handleRowMouseDown = (event: MouseEvent, entry: LineEntry) => {
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

		props.onRowClick(entry)
	}

const foldMap = createMemo(() => {
	const folds = props.folds?.()
	const map = new Map<number, FoldRange>()
	if (!folds) return map
	// TODO: integrate fold gutter with custom virtualization once folded rows are hidden
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
				width: `${LINE_NUMBER_WIDTH}px`
			}}
		>
			<div
				class="relative h-full"
				style={{
					'padding-left': `${EDITOR_PADDING_LEFT}px`
				}}
			>
				{props.rows().map(virtualRow => {
					const entry: LineEntry | undefined =
						cursor.lineEntries()[virtualRow.index]
					if (!entry) return null

					const height = virtualRow.size || props.lineHeight()
					const isActive = props.activeLineIndex() === entry.index
					const hasFold = foldMap().has(entry.index)
					const isFolded = props.foldedStarts?.()?.has(entry.index) ?? false

					return (
						<div
							data-index={virtualRow.index}
							class="absolute left-0 right-0"
							style={{
								transform: `translateY(${virtualRow.start}px)`,
								top: 0,
								height: `${height}px`
							}}
						>
							<div
								class="relative flex h-full items-center justify-end"
								onMouseDown={event => handleRowMouseDown(event, entry)}
							>
								<LineGutter
									lineNumber={entry.index + 1}
									lineHeight={height}
									isActive={isActive}
									isFoldable={hasFold}
									isFolded={isFolded}
									onFoldClick={
										hasFold
											? () => props.onToggleFold?.(entry.index)
											: undefined
									}
								/>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
