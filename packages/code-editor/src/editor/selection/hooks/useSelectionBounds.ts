import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import { getSelectionBounds, useCursor } from '../../cursor'
import type { SelectionBounds } from '../types'

export const useSelectionBounds = (): Accessor<SelectionBounds | null> => {
	const cursor = useCursor()
	const selectionBounds = createMemo(() => {
		const currentSelections = cursor.state.selections
		if (currentSelections.length === 0) {
			return null
		}

		const firstSelection = currentSelections[0]!
		const bounds = getSelectionBounds(firstSelection)
		return bounds.start === bounds.end ? null : bounds
	})

	return selectionBounds
}
