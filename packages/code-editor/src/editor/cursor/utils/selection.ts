import type { CursorState } from '../types'

export const getSelectionAnchor = (state: CursorState): number => {
	const firstSelection = state.selections[0]
	if (firstSelection) {
		return firstSelection.anchor
	}
	return state.position.offset
}
