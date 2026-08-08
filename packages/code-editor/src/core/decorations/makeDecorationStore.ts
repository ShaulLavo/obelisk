/**
 * makeDecorationStore — versioned async decoration storage.
 *
 * Owns per-line decoration data keyed by line ID.
 * Discards stale results when identity/docVersion doesn't match.
 * Provides cheap line decoration lookups for the renderer.
 *
 * Framework-free. No Solid, no DOM.
 */

import type { DocumentIdentity } from '../types'
import {
	type HighlightRange,
	type LineHighlightSegment,
	absoluteToPerLine,
} from './decorationSegments'
import { type BracketInfo, absoluteToPerLineBrackets } from './bracketDepths'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LineDecorations = {
	highlightSegments: LineHighlightSegment[] | null
	errorSegments: LineHighlightSegment[] | null
	bracketDepths: Record<number, number> | null
	revision: number
}

export type SearchHighlight = {
	start: number
	end: number
}

export type SearchState = {
	query: string
	matches: SearchHighlight[]
	currentIndex: number
}

export type DecorationStoreSnapshot = {
	identity: DocumentIdentity
	docVersion: number
	highlights: HighlightRange[]
	errors: HighlightRange[]
	brackets: BracketInfo[]
}

export type DecorationStore = {
	/** Apply a worker snapshot. Discards if stale. Returns affected line IDs or null. */
	apply(
		snapshot: DecorationStoreSnapshot,
		currentIdentity: DocumentIdentity,
		currentDocVersion: number,
		lineStarts: number[],
		lineIds: number[]
	): number[] | null

	/** Get decorations for a line ID. Returns null if no decorations exist. */
	getLineDecorations(lineId: number): LineDecorations | null

	/** Get the presentation fallback for a line (stale but usable decorations). */
	getFallback(lineId: number): LineDecorations | null

	/** Set synchronous search state (for find/replace). */
	setSearchState(state: SearchState | null): void

	/** Get current search state. */
	getSearchState(): SearchState | null

	/** Get search highlights for a line. */
	getSearchHighlights(
		lineId: number,
		lineStart: number,
		lineLength: number
	): LineHighlightSegment[] | null

	/** Clear all decorations (e.g., on worker crash). */
	clear(): void

	/** Promote current decorations to fallback (before a new version arrives). */
	promoteFallback(): void

	/** Get decoration revision for a line. */
	getLineDecorationRevision(lineId: number): number
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makeDecorationStore = (): DecorationStore => {
	const linesById = new Map<number, LineDecorations>()
	const fallbackById = new Map<number, LineDecorations>()
	let globalRevision = 0
	let searchState: SearchState | null = null

	return {
		apply(snapshot, currentIdentity, currentDocVersion, lineStarts, lineIds) {
			// Validate identity
			if (
				snapshot.identity.sessionId !== currentIdentity.sessionId ||
				snapshot.identity.documentKey !== currentIdentity.documentKey ||
				snapshot.identity.documentIncarnation !== currentIdentity.documentIncarnation
			) {
				return null // wrong document
			}

			// Validate version
			if (snapshot.docVersion !== currentDocVersion) {
				return null // stale
			}

			// Convert absolute ranges to per-line
			const highlightsByLine = absoluteToPerLine(snapshot.highlights, lineStarts, lineIds)
			const errorsByLine = absoluteToPerLine(snapshot.errors, lineStarts, lineIds)
			const bracketsByLine = absoluteToPerLineBrackets(snapshot.brackets, lineStarts, lineIds)

			// Collect all affected line IDs
			const affectedIds = new Set<number>()

			// Gather all lines that have new data
			for (const id of highlightsByLine.keys()) affectedIds.add(id)
			for (const id of errorsByLine.keys()) affectedIds.add(id)
			for (const id of bracketsByLine.keys()) affectedIds.add(id)

			// Also mark lines that previously had data but no longer do
			for (const id of linesById.keys()) {
				if (!highlightsByLine.has(id) && !errorsByLine.has(id) && !bracketsByLine.has(id)) {
					affectedIds.add(id)
				}
			}

			globalRevision++

			// Clear old and apply new
			linesById.clear()
			for (const lineId of lineIds) {
				const highlights = highlightsByLine.get(lineId) ?? null
				const errors = errorsByLine.get(lineId) ?? null
				const brackets = bracketsByLine.get(lineId) ?? null

				if (highlights || errors || brackets) {
					linesById.set(lineId, {
						highlightSegments: highlights,
						errorSegments: errors,
						bracketDepths: brackets,
						revision: globalRevision,
					})
				}
			}

			return [...affectedIds]
		},

		getLineDecorations(lineId) {
			return linesById.get(lineId) ?? null
		},

		getFallback(lineId) {
			return fallbackById.get(lineId) ?? null
		},

		setSearchState(state) {
			searchState = state
		},

		getSearchState() {
			return searchState
		},

		getSearchHighlights(lineId, lineStart, lineLength) {
			if (!searchState || searchState.matches.length === 0) return null

			const lineEnd = lineStart + lineLength
			const segments: LineHighlightSegment[] = []

			for (const match of searchState.matches) {
				if (match.end <= lineStart) continue
				if (match.start >= lineEnd) break

				segments.push({
					start: Math.max(0, match.start - lineStart),
					end: Math.min(lineLength, match.end - lineStart),
					className: 'editor-search-highlight',
					scope: 'search',
				})
			}

			return segments.length > 0 ? segments : null
		},

		clear() {
			linesById.clear()
			globalRevision++
		},

		promoteFallback() {
			fallbackById.clear()
			for (const [id, dec] of linesById) {
				fallbackById.set(id, { ...dec })
			}
		},

		getLineDecorationRevision(lineId) {
			return linesById.get(lineId)?.revision ?? 0
		},
	}
}
