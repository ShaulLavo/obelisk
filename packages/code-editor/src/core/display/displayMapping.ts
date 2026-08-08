/**
 * displayMapping — utility functions for display-to-document coordinate conversion.
 *
 * These helpers work with the FoldMapping from foldMapping.ts.
 * They provide the conversion layer that the view and overlay use.
 */

import type { FoldMapping } from '../folds/foldMapping'

/**
 * Convert a display row to a document line index.
 * Returns the document line, clamped to valid range.
 */
export const displayRowToDocumentLine = (
	mapping: FoldMapping,
	displayRow: number
): number => mapping.displayRowToLine(displayRow)

/**
 * Convert a document line index to a display row.
 * Returns -1 if the line is hidden by a fold.
 */
export const documentLineToDisplayRow = (
	mapping: FoldMapping,
	lineIndex: number
): number => mapping.lineToDisplayRow(lineIndex)

/**
 * Get the display row count (visible lines after folding).
 */
export const getDisplayRowCount = (mapping: FoldMapping): number =>
	mapping.displayRowCount

/**
 * Find the visible display row range for a viewport.
 * Returns { startRow, endRow } in display row coordinates.
 */
export const computeDisplayVisibleRange = (
	mapping: FoldMapping,
	scrollTop: number,
	viewportHeight: number,
	lineHeight: number,
	overscan: number
): { startRow: number; endRow: number } => {
	const totalRows = mapping.displayRowCount
	if (totalRows === 0 || lineHeight <= 0) {
		return { startRow: 0, endRow: 0 }
	}

	const firstVisible = Math.floor(scrollTop / lineHeight)
	const lastVisible = Math.ceil((scrollTop + viewportHeight) / lineHeight)

	return {
		startRow: Math.max(0, firstVisible - overscan),
		endRow: Math.min(totalRows, lastVisible + overscan),
	}
}
