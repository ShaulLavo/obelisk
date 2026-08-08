/**
 * FoldModel — fold state management.
 *
 * Tracks which lines are folded. Fold state is core editor state (user intent),
 * not decoration. Fold-open toggles go through EditorCore.dispatch.
 *
 * Framework-free.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FoldRegion = {
	/** Line ID of the fold start line. */
	startLineId: number
	/** Line ID of the fold end line (exclusive). */
	endLineId: number
	/** Whether the fold is currently collapsed. */
	collapsed: boolean
}

export type FoldState = {
	/** Active fold regions, keyed by start line ID. */
	regions: Map<number, FoldRegion>
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createFoldState = (): FoldState => ({
	regions: new Map(),
})

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Register a fold region (from worker/tree-sitter data). */
export const addFoldRegion = (
	state: FoldState,
	startLineId: number,
	endLineId: number
): FoldState => {
	const regions = new Map(state.regions)
	const existing = regions.get(startLineId)
	regions.set(startLineId, {
		startLineId,
		endLineId,
		collapsed: existing?.collapsed ?? false,
	})
	return { regions }
}

/** Toggle fold collapsed state. */
export const toggleFold = (
	state: FoldState,
	startLineId: number,
	collapsed: boolean
): FoldState => {
	const region = state.regions.get(startLineId)
	if (!region) return state

	const regions = new Map(state.regions)
	regions.set(startLineId, { ...region, collapsed })
	return { regions }
}

/** Remove a fold region. */
export const removeFoldRegion = (
	state: FoldState,
	startLineId: number
): FoldState => {
	if (!state.regions.has(startLineId)) return state
	const regions = new Map(state.regions)
	regions.delete(startLineId)
	return { regions }
}

/** Clear all fold regions (e.g., on document replacement). */
export const clearFolds = (): FoldState => ({
	regions: new Map(),
})

/** Get all collapsed fold start line IDs. */
export const getCollapsedFolds = (state: FoldState): number[] =>
	[...state.regions.values()]
		.filter((r) => r.collapsed)
		.map((r) => r.startLineId)

/** Check if a specific fold is collapsed. */
export const isFoldCollapsed = (state: FoldState, startLineId: number): boolean =>
	state.regions.get(startLineId)?.collapsed ?? false
