import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { SelectionRange } from '../../cursor'
import { getSelectionBounds } from '../../cursor'
import type { SelectionBounds } from '../types'

export const useSelectionBounds = (
	selections: Accessor<SelectionRange[]>
): Accessor<SelectionBounds | null> => {
	const selectionBounds = createMemo(() => {
		const currentSelections = selections()
		if (currentSelections.length === 0) {
			return null
		}

		const firstSelection = currentSelections[0]!
		const bounds = getSelectionBounds(firstSelection)
		return bounds.start === bounds.end ? null : bounds
	})

	return selectionBounds
}
