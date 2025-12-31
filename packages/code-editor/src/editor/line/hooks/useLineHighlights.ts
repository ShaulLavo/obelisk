import { createMemo, type Accessor } from 'solid-js'

import type { LineEntry, LineHighlightSegment } from '../../types'
import { areHighlightSegmentsEqual } from '../utils/lineComparisons'

export type UseLineHighlightsOptions = {
	entry: Accessor<LineEntry | null>
	getLineHighlights: Accessor<
		((entry: LineEntry) => LineHighlightSegment[] | undefined) | undefined
	>
	highlightRevision: Accessor<number | undefined>
}

export const useLineHighlights = (
	options: UseLineHighlightsOptions
): Accessor<LineHighlightSegment[] | undefined> => {
	let lastHighlightEntry: LineEntry | null = null
	let lastHighlightRevision = -1

	const highlights = createMemo(
		(previous) => {
			const e = options.entry()
			if (!e) {
				lastHighlightEntry = null
				return undefined
			}

			const revision = options.highlightRevision() ?? 0
			if (
				previous &&
				lastHighlightEntry &&
				lastHighlightRevision === revision &&
				lastHighlightEntry.lineId === e.lineId &&
				lastHighlightEntry.length === e.length &&
				lastHighlightEntry.text === e.text
			) {
				lastHighlightEntry = e
				return previous
			}

			const getLineHighlights = options.getLineHighlights()
			const next = getLineHighlights?.(e)
			lastHighlightEntry = e
			lastHighlightRevision = revision
			return next
		},
		undefined,
		{ equals: areHighlightSegmentsEqual }
	)
	return highlights
}
