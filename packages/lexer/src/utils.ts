/**
 * Lexer Utility Functions
 */

/**
 * Check if identifier is SCREAMING_CASE (all uppercase with underscores)
 */
export const isScreamingCase = (s: string): boolean =>
	s.length > 1 && /^[A-Z][A-Z0-9_]+$/.test(s)

/**
 * Peek next non-whitespace character from position
 */
export const peekNextNonSpace = (
	line: string,
	from: number,
	len: number
): string => {
	for (let j = from; j < len; j++) {
		const c = line[j]
		if (c !== ' ' && c !== '\t') return c!
	}
	return ''
}

/**
 * Peek previous non-whitespace character from position
 */
export const peekPrevNonSpace = (line: string, from: number): string => {
	for (let j = from - 1; j >= 0; j--) {
		const c = line[j]
		if (c !== ' ' && c !== '\t') return c!
	}
	return ''
}
