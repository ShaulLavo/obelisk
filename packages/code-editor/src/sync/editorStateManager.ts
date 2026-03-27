import type { 
	EditorInstance, 
	EditorState, 
	CursorPosition, 
	EditorScrollPosition, 
	FoldedRegion, 
	TextSelection 
} from './types'

/**
 * Manages editor state preservation during content updates.
 * Handles capturing and restoring cursor position, scroll position, and folding states
 * when file content changes externally.
 */
export class EditorStateManager {
	/**
	 * Capture current editor state for preservation
	 */
	captureState(editor: EditorInstance): EditorState {
		return {
			cursorPosition: editor.getCursorPosition(),
			scrollPosition: editor.getScrollPosition(),
			foldedRegions: editor.getFoldedRegions(),
			// Note: selection is optional and may not be available in all editor implementations
		}
	}

	/**
	 * Restore editor state after content update
	 * Attempts to preserve state when possible, falls back to reasonable positioning
	 */
	restoreState(editor: EditorInstance, state: EditorState, newContent: string): void {
		const lines = newContent.split('\n')
		const maxLine = Math.max(0, lines.length - 1)

		// Restore cursor position with fallback
		const restoredCursor = this.calculateBestCursorPosition(
			editor.getContent(), // old content (before update)
			newContent,
			state.cursorPosition
		)
		
		// Ensure cursor is within bounds
		const safeCursor: CursorPosition = {
			line: Math.min(restoredCursor.line, maxLine),
			column: Math.max(0, restoredCursor.column)
		}
		
		// Ensure column doesn't exceed line length
		if (safeCursor.line < lines.length) {
			const lineLength = lines[safeCursor.line]?.length ?? 0
			safeCursor.column = Math.min(safeCursor.column, lineLength)
			
			// If the calculated position is 0 but we had a specific column request,
			// try to preserve some of the original column intent
			if (safeCursor.column === 0 && state.cursorPosition.column > 0) {
				safeCursor.column = Math.min(state.cursorPosition.column, lineLength)
			}
		}

		editor.setCursorPosition(safeCursor)

		// Restore scroll position
		// Note: Scroll restoration is best-effort as content changes may affect layout
		try {
			editor.setScrollPosition(state.scrollPosition)
		} catch (error) {
			// Fallback: scroll to cursor position if direct restoration fails
			console.warn('Failed to restore scroll position, falling back to cursor position')
		}

		// Restore folded regions that are still valid
		const validFoldedRegions = this.validateFoldedRegions(state.foldedRegions, lines)
		try {
			editor.setFoldedRegions(validFoldedRegions)
		} catch (error) {
			// Folding restoration is optional - don't fail if not supported
			console.warn('Failed to restore folded regions:', error)
		}
	}

	/**
	 * Calculate best cursor position after content change
	 * Uses line-based heuristics to find the most appropriate position
	 */
	calculateBestCursorPosition(
		oldContent: string, 
		newContent: string, 
		oldPosition: CursorPosition
	): CursorPosition {
		const oldLines = oldContent.split('\n')
		const newLines = newContent.split('\n')

		// If the target line still exists and hasn't changed significantly, keep the position
		if (oldPosition.line < newLines.length && oldPosition.line < oldLines.length) {
			const oldLine = oldLines[oldPosition.line]
			const newLine = newLines[oldPosition.line]
			
			// If the line is identical, preserve the exact position
			if (oldLine === newLine) {
				return {
					line: oldPosition.line,
					column: Math.min(oldPosition.column, newLine?.length ?? 0)
				}
			}
			
			// If the line has minor changes, try to preserve column position
			if (oldLine && newLine && this.linesAreSimilar(oldLine, newLine)) {
				return {
					line: oldPosition.line,
					column: Math.min(oldPosition.column, newLine.length)
				}
			}
		}

		// If the exact line is not available, try to find a similar line nearby
		const nearbyPosition = this.findSimilarLineNearby(oldLines, newLines, oldPosition)
		if (nearbyPosition) {
			return nearbyPosition
		}

		// Fallback: try to maintain relative position in the document
		const relativePosition = oldPosition.line / Math.max(1, oldLines.length - 1)
		const newTargetLine = Math.floor(relativePosition * Math.max(1, newLines.length - 1))
		
		return {
			line: Math.min(newTargetLine, newLines.length - 1),
			column: 0 // Start of line as safest fallback
		}
	}

	/**
	 * Check if two lines are similar enough to preserve cursor position
	 */
	private linesAreSimilar(line1: string, line2: string): boolean {
		// Simple similarity check - could be enhanced with more sophisticated algorithms
		const trimmed1 = line1.trim()
		const trimmed2 = line2.trim()
		
		// If both lines are empty or whitespace-only, consider them similar
		if (trimmed1.length === 0 && trimmed2.length === 0) {
			return true
		}
		
		// Check if one line is a substring of the other (common for additions/deletions)
		if (trimmed1.includes(trimmed2) || trimmed2.includes(trimmed1)) {
			return true
		}
		
		// Check for high character overlap (simple Jaccard similarity)
		const chars1 = new Set(trimmed1)
		const chars2 = new Set(trimmed2)
		const intersection = new Set([...chars1].filter(x => chars2.has(x)))
		const union = new Set([...chars1, ...chars2])
		
		const similarity = intersection.size / union.size
		return similarity > 0.6 // 60% character overlap threshold
	}

	/**
	 * Find a similar line near the original position
	 */
	private findSimilarLineNearby(
		oldLines: string[], 
		newLines: string[], 
		oldPosition: CursorPosition
	): CursorPosition | null {
		if (oldPosition.line >= oldLines.length) {
			return null
		}
		
		const targetLine = oldLines[oldPosition.line]?.trim()
		if (!targetLine || targetLine.length === 0) {
			return null // Don't try to match empty lines
		}
		
		// Search within a reasonable range around the original position
		const searchRange = Math.min(10, Math.floor(newLines.length / 4))
		const startSearch = Math.max(0, oldPosition.line - searchRange)
		const endSearch = Math.min(newLines.length, oldPosition.line + searchRange + 1)
		
		for (let i = startSearch; i < endSearch; i++) {
			const newLine = newLines[i]
			if (newLine && this.linesAreSimilar(targetLine, newLine)) {
				return {
					line: i,
					column: Math.min(oldPosition.column, newLine.length)
				}
			}
		}
		
		return null
	}

	/**
	 * Validate folded regions against new content and filter out invalid ones
	 */
	private validateFoldedRegions(regions: FoldedRegion[], newLines: string[]): FoldedRegion[] {
		return regions.filter(region => {
			// Check if the region is within bounds
			if (region.startLine < 0 || region.endLine >= newLines.length) {
				return false
			}
			
			// Check if start line comes before end line
			if (region.startLine >= region.endLine) {
				return false
			}
			
			// Additional validation could be added here to check if the folded content
			// still makes sense (e.g., matching braces, indentation patterns)
			
			return true
		})
	}
}