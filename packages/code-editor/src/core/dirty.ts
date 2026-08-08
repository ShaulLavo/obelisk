/**
 * Dirty state creation and merging — shared by EditorCore and FrameScheduler.
 */

import type {
	DocumentIdentity,
	VersionCounters,
	EditorDirtyState,
} from './types'

export const createEmptyDirty = (
	identity: DocumentIdentity,
	versions: VersionCounters
): EditorDirtyState => ({
	identity,
	docVersion: versions.docVersion,
	decorationVersion: versions.decorationVersion,
	text: false,
	gutter: false,
	overlay: false,
	viewport: false,
	fullMeasure: false,
	lineRange: null,
	decorationLineIds: null,
	scrollAnchor: null,
})

export const mergeDirty = (
	acc: EditorDirtyState,
	patch: Partial<EditorDirtyState>
): EditorDirtyState => {
	const merged = { ...acc }

	if (patch.text) merged.text = true
	if (patch.gutter) merged.gutter = true
	if (patch.overlay) merged.overlay = true
	if (patch.viewport) merged.viewport = true
	if (patch.fullMeasure) merged.fullMeasure = true

	if (patch.docVersion !== undefined) merged.docVersion = patch.docVersion
	if (patch.decorationVersion !== undefined)
		merged.decorationVersion = patch.decorationVersion

	// Merge line ranges by union
	if (patch.lineRange) {
		if (merged.lineRange) {
			merged.lineRange = {
				start: Math.min(merged.lineRange.start, patch.lineRange.start),
				end: Math.max(merged.lineRange.end, patch.lineRange.end),
			}
		} else {
			merged.lineRange = { ...patch.lineRange }
		}
	}

	// Merge decoration line IDs by set union
	if (patch.decorationLineIds) {
		if (merged.decorationLineIds) {
			const set = new Set([
				...merged.decorationLineIds,
				...patch.decorationLineIds,
			])
			merged.decorationLineIds = [...set]
		} else {
			merged.decorationLineIds = [...patch.decorationLineIds]
		}
	}

	if (patch.scrollAnchor) {
		merged.scrollAnchor = patch.scrollAnchor
	}

	return merged
}
