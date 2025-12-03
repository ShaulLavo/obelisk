import { parse } from 'shell-quote'
import { logger } from '~/logger'
import type { TerminalPosition, AutocompleteHandler } from './types'

/**
 * Detects all word boundaries in the given input.
 * @param input - The input string to analyze
 * @param leftSide - If true, returns left boundaries (start of words); if false, right boundaries (end of words)
 * @returns Array of boundary positions
 */
export function getWordBoundaries(input: string, leftSide = true): number[] {
	const boundaries: number[] = []
	const wordRegex = /\w+/g
	let match: RegExpExecArray | null

	while ((match = wordRegex.exec(input)) !== null) {
		boundaries.push(leftSide ? match.index : match.index + match[0].length)
	}

	return boundaries
}

/**
 * Find the closest left word boundary from the given offset.
 * @param input - The input string
 * @param offset - Current cursor position
 * @returns Position of closest left boundary, or 0 if none found
 */
export function closestLeftBoundary(input: string, offset: number): number {
	const boundaries = getWordBoundaries(input, true)
	const found = boundaries.reverse().find((x) => x < offset)
	return found ?? 0
}

/**
 * Find the closest right word boundary from the given offset.
 * @param input - The input string
 * @param offset - Current cursor position
 * @returns Position of closest right boundary, or input length if none found
 */
export function closestRightBoundary(input: string, offset: number): number {
	const boundaries = getWordBoundaries(input, false)
	const found = boundaries.find((x) => x > offset)
	return found ?? input.length
}

/**
 * Convert a character offset to terminal column/row position.
 * Simulates cursor navigation including line wrapping at terminal width.
 * @param input - The input string
 * @param offset - Character offset in the input
 * @param maxCols - Terminal column width
 * @returns Position with col and row
 */
export function offsetToColRow(input: string, offset: number, maxCols: number): TerminalPosition {
	let row = 0
	let col = 0

	for (let i = 0; i < offset; i++) {
		const char = input.charAt(i)

		if (char === '\n') {
			col = 0
			row += 1
		} else {
			col += 1
			if (col > maxCols) {
				col = 0
				row += 1
			}
		}
	}

	return { row, col }
}

/**
 * Count the number of display lines for the given input.
 * @param input - The input string
 * @param maxCols - Terminal column width
 * @returns Number of lines the input would occupy
 */
export function countLines(input: string, maxCols: number): number {
	return offsetToColRow(input, input.length, maxCols).row + 1
}

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
export function isIncompleteInput(input: string): boolean {
	const trimmed = input.trim()
	if (trimmed === '') return false

	// Check for dangling single quotes
	const singleQuotes = (input.match(/'/g) ?? []).length
	if (singleQuotes % 2 !== 0) return true

	// Check for dangling double quotes
	const doubleQuotes = (input.match(/"/g) ?? []).length
	if (doubleQuotes % 2 !== 0) return true

	// Check for trailing boolean or pipe operators
	const parts = input.split(/(\|\||\||&&)/g)
	const lastPart = parts.pop()
	if (lastPart?.trim() === '') return true

	// Check for trailing backslash (line continuation)
	if (input.endsWith('\\') && !input.endsWith('\\\\')) return true

	return false
}

/**
 * Check if the input ends with unescaped whitespace.
 * @param input - The input string
 * @returns true if input has trailing whitespace
 */
export function hasTailingWhitespace(input: string): boolean {
	return /[^\\][ \t]$/m.test(input)
}

/**
 * Get the last token from the input for autocompletion.
 * @param input - The input string
 * @returns The last token, or empty string if none
 */
export function getLastToken(input: string): string {
	if (input.trim() === '') return ''
	if (hasTailingWhitespace(input)) return ''

	const tokens = parse(input)
	const lastToken = tokens.pop()

	// shell-quote can return objects for special tokens
	if (typeof lastToken === 'string') return lastToken
	return ''
}

/**
 * Collect autocomplete candidates from all registered handlers.
 * @param handlers - Registered autocomplete handlers
 * @param input - Current input string
 * @returns Array of matching completion candidates
 */
export function collectAutocompleteCandidates(
	handlers: AutocompleteHandler[],
	input: string
): string[] {
	const tokens = parse(input).filter((t): t is string => typeof t === 'string')

	let index = tokens.length - 1
	let expr = tokens[index] ?? ''

	if (input.trim() === '') {
		index = 0
		expr = ''
	} else if (hasTailingWhitespace(input)) {
		index += 1
		expr = ''
	}

	// Collect candidates from all handlers
	const allCandidates = handlers.reduce<string[]>((candidates, { fn, args }) => {
		try {
			const results = fn(index, tokens, ...args)
			return candidates.concat(results)
		} catch (err) {
			logger
				.withTag('terminal')
				.warn('Autocomplete error', { error: err })
			return candidates
		}
	}, [])

	// Filter to candidates starting with current expression
	return allCandidates.filter((candidate) => candidate.startsWith(expr))
}

/**
 * Find the longest shared prefix among completion candidates.
 * Used for partial completion when multiple candidates match.
 * @param fragment - Current fragment being completed
 * @param candidates - Array of completion candidates
 * @returns Longest shared fragment, or null if no common prefix
 */
export function getSharedFragment(fragment: string, candidates: string[]): string | null {
	if (candidates.length === 0) return null
	if (fragment.length >= candidates[0].length) return fragment

	const oldFragment = fragment
	const nextChar = candidates[0].charAt(fragment.length)
	const newFragment = fragment + nextChar

	for (const candidate of candidates) {
		if (!candidate.startsWith(oldFragment)) return null
		if (!candidate.startsWith(newFragment)) return oldFragment
	}

	return getSharedFragment(newFragment, candidates)
}
