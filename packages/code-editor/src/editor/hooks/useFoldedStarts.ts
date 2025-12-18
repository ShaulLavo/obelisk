import { createEffect, createSignal, on, type Accessor } from 'solid-js'
import type { FoldRange } from '../types'

export type UseFoldedStartsOptions = {
	filePath: Accessor<string | undefined>
	folds?: Accessor<FoldRange[] | undefined>
	scrollElement: Accessor<HTMLDivElement | null>
}

export const useFoldedStarts = (options: UseFoldedStartsOptions) => {
	const [foldedStarts, setFoldedStarts] = createSignal<Set<number>>(new Set())

	const toggleFold = (startLine: number) => {
		const foldRanges = options.folds?.()
		if (
			!foldRanges?.some(
				(range) =>
					range.startLine === startLine && range.endLine > range.startLine
			)
		) {
			return
		}

		setFoldedStarts((prev) => {
			const next = new Set(prev)
			if (next.has(startLine)) {
				next.delete(startLine)
			} else {
				next.add(startLine)
			}
			return next
		})
	}

	createEffect(
		on(options.filePath, () => {
			const element = options.scrollElement()
			if (element) {
				element.scrollTop = 0
				element.scrollLeft = 0
			}
			setFoldedStarts(new Set<number>())
		})
	)

	createEffect(
		on(
			() => options.folds?.(),
			(folds) => {
				if (!folds?.length) {
					setFoldedStarts(new Set<number>())
					return
				}

				setFoldedStarts((prev) => {
					if (prev.size === 0) return prev

					const validStarts = new Set(
						folds
							.filter((f) => f.endLine > f.startLine)
							.map((f) => f.startLine)
					)

					let changed = false
					const next = new Set<number>()
					for (const start of prev) {
						if (validStarts.has(start)) {
							next.add(start)
						} else {
							changed = true
						}
					}

					return changed ? next : prev
				})
			}
		)
	)

	return { foldedStarts, toggleFold }
}

