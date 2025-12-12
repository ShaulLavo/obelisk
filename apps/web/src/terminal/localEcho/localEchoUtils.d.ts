import type { TerminalPosition, AutocompleteHandler } from './types'
/**
 * Detects all word boundaries in the given input.
 * @param input - The input string to analyze
 * @param leftSide - If true, returns left boundaries (start of words); if false, right boundaries (end of words)
 * @returns Array of boundary positions
 */
export declare function getWordBoundaries(
	input: string,
	leftSide?: boolean
): number[]
/**
 * Find the closest left word boundary from the given offset.
 * @param input - The input string
 * @param offset - Current cursor position
 * @returns Position of closest left boundary, or 0 if none found
 */
export declare function closestLeftBoundary(
	input: string,
	offset: number
): number
/**
 * Find the closest right word boundary from the given offset.
 * @param input - The input string
 * @param offset - Current cursor position
 * @returns Position of closest right boundary, or input length if none found
 */
export declare function closestRightBoundary(
	input: string,
	offset: number
): number
/**
 * Convert a character offset to terminal column/row position.
 * Simulates cursor navigation including line wrapping at terminal width.
 * @param input - The input string
 * @param offset - Character offset in the input
 * @param maxCols - Terminal column width
 * @returns Position with col and row
 */
export declare function offsetToColRow(
	input: string,
	offset: number,
	maxCols: number
): TerminalPosition
/**
 * Count the number of display lines for the given input.
 * @param input - The input string
 * @param maxCols - Terminal column width
 * @returns Number of lines the input would occupy
 */
export declare function countLines(input: string, maxCols: number): number
/**
 * Check if input is incomplete and needs continuation.
 * Incomplete input includes:
 * - Unterminated single quotes
 * - Unterminated double quotes
 * - Trailing backslash (line continuation)
 * - Incomplete boolean expressions (&& or ||)
 * - Incomplete pipe expressions (|)
 * @param input - The input string to check
 * @returns true if input needs continuation
 */
export declare function isIncompleteInput(input: string): boolean
/**
 * Check if the input ends with unescaped whitespace.
 * @param input - The input string
 * @returns true if input has trailing whitespace
 */
export declare function hasTailingWhitespace(input: string): boolean
/**
 * Get the last token from the input for autocompletion.
 * @param input - The input string
 * @returns The last token, or empty string if none
 */
export declare function getLastToken(input: string): string
/**
 * Collect autocomplete candidates from all registered handlers.
 * @param handlers - Registered autocomplete handlers
 * @param input - Current input string
 * @returns Array of matching completion candidates
 */
export declare function collectAutocompleteCandidates(
	handlers: AutocompleteHandler[],
	input: string
): string[]
/**
 * Find the longest shared prefix among completion candidates.
 * Used for partial completion when multiple candidates match.
 * @param fragment - Current fragment being completed
 * @param candidates - Array of completion candidates
 * @returns Longest shared fragment, or null if no common prefix
 */
export declare function getSharedFragment(
	fragment: string,
	candidates: string[]
): string | null
//# sourceMappingURL=localEchoUtils.d.ts.map
