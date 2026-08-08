/**
 * DisplayModel — display-to-document mapping for the viewport.
 *
 * Translates between display rows and document lines,
 * accounting for folds. Tracks content width via idle width scanning.
 *
 * Framework-free.
 */

import type { EditorCore } from '../types'
import { type FoldMapping, buildFoldMapping } from '../folds/foldMapping'
import { type FoldState, createFoldState } from '../folds/FoldModel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WidthScanState = {
	/** The maximum visual column width seen so far. */
	maxVisualColumns: number
	/** Line ID that currently owns the max width. */
	maxWidthLineId: number | null
	/** Index of the next line to scan (for idle scanning). */
	nextScanIndex: number
	/** Whether a scan is in progress. */
	scanning: boolean
}

export type DisplayModelState = {
	foldState: FoldState
	foldMapping: FoldMapping
	widthScan: WidthScanState
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createDisplayModel = (core: EditorCore): DisplayModelState => {
	const foldState = createFoldState()
	const foldMapping = buildFoldMapping(foldState, core.getLineCount(), (id) =>
		core.getLineIndex(id)
	)

	return {
		foldState,
		foldMapping,
		widthScan: {
			maxVisualColumns: 0,
			maxWidthLineId: null,
			nextScanIndex: 0,
			scanning: false,
		},
	}
}

// ---------------------------------------------------------------------------
// Fold operations
// ---------------------------------------------------------------------------

export const rebuildFoldMapping = (
	state: DisplayModelState,
	core: EditorCore
): DisplayModelState => ({
	...state,
	foldMapping: buildFoldMapping(state.foldState, core.getLineCount(), (id) =>
		core.getLineIndex(id)
	),
})

// ---------------------------------------------------------------------------
// Width scanning
// ---------------------------------------------------------------------------

/**
 * Compute the visual width of a line in columns (tab-aware).
 */
export const computeLineVisualWidth = (
	lineText: string,
	tabSize: number
): number => {
	let width = 0
	for (let i = 0; i < lineText.length; i++) {
		if (lineText[i] === '\t') {
			width += tabSize - (width % tabSize)
		} else {
			width++
		}
	}
	return width
}

/**
 * Scan a batch of lines for width. Returns the updated width scan state.
 *
 * @param batchSize Number of lines to scan in this slice.
 */
export const scanWidthBatch = (
	state: DisplayModelState,
	core: EditorCore,
	tabSize: number,
	batchSize: number
): DisplayModelState => {
	const lineCount = core.getLineCount()
	const scan = { ...state.widthScan }

	if (scan.nextScanIndex >= lineCount) {
		scan.scanning = false
		return { ...state, widthScan: scan }
	}

	scan.scanning = true
	const end = Math.min(scan.nextScanIndex + batchSize, lineCount)

	for (let i = scan.nextScanIndex; i < end; i++) {
		const text = core.getLineText(i)
		const width = computeLineVisualWidth(text, tabSize)
		if (width > scan.maxVisualColumns) {
			scan.maxVisualColumns = width
			scan.maxWidthLineId = core.getLineId(i)
		}
	}

	scan.nextScanIndex = end
	if (end >= lineCount) {
		scan.scanning = false
	}

	return { ...state, widthScan: scan }
}

/**
 * Reset width scan (e.g., after the max-width owner line is deleted or shortened).
 */
export const resetWidthScan = (state: DisplayModelState): DisplayModelState => ({
	...state,
	widthScan: {
		maxVisualColumns: 0,
		maxWidthLineId: null,
		nextScanIndex: 0,
		scanning: false,
	},
})

/**
 * Check if the max-width owner has changed and needs a rescan.
 */
export const needsWidthRescan = (
	state: DisplayModelState,
	core: EditorCore,
	tabSize: number
): boolean => {
	const { maxWidthLineId } = state.widthScan
	if (maxWidthLineId === null) return true

	try {
		const lineIndex = core.getLineIndex(maxWidthLineId)
		const text = core.getLineText(lineIndex)
		const currentWidth = computeLineVisualWidth(text, tabSize)
		return currentWidth < state.widthScan.maxVisualColumns
	} catch {
		// Line was deleted
		return true
	}
}
