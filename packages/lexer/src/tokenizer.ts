/**
 * Core Lexer Tokenization Logic
 *
 * Pure functional tokenization utilities.
 */

import {
	type BracketInfo,
	type Token,
	type LineState,
	type TokenizeResult,
	LexState,
} from './types'
import {
	OPEN_BRACKETS,
	CLOSE_BRACKETS,
	WORD_CHAR,
	DIGIT,
	HEX_DIGIT,
} from './consts'
import { isScreamingCase, peekNextNonSpace, peekPrevNonSpace } from './utils'

const isRegexLiteralContext = (prevNonSpace: string): boolean => {
	if (prevNonSpace === '') return true

	const isWordLike = WORD_CHAR.test(prevNonSpace)
	if (isWordLike) return false

	const isDigitLike = DIGIT.test(prevNonSpace)
	if (isDigitLike) return false

	const isClosingDelimiter =
		prevNonSpace === ')' ||
		prevNonSpace === ']' ||
		prevNonSpace === '}' ||
		prevNonSpace === '"' ||
		prevNonSpace === "'" ||
		prevNonSpace === '`'
	if (isClosingDelimiter) return false

	return true
}

const readRegexLiteralEnd = (
	line: string,
	startIndex: number
): { endIndex: number; isClosed: boolean } => {
	let i = startIndex
	const len = line.length
	let inCharClass = false

	while (i < len) {
		const c = line[i] ?? ''

		if (c === '\\' && i + 1 < len) {
			i += 2
			continue
		}

		if (c === '[') {
			inCharClass = true
			i += 1
			continue
		}

		if (c === ']' && inCharClass) {
			inCharClass = false
			i += 1
			continue
		}

		if (c === '/' && inCharClass === false) {
			i += 1
			while (i < len) {
				const flag = line[i] ?? ''
				const isFlag = /[a-z]/i.test(flag)
				if (isFlag === false) break
				i += 1
			}

			return { endIndex: i, isClosed: true }
		}

		i += 1
	}

	return { endIndex: len, isClosed: false }
}

/**
 * Get scope for an identifier using SCM-derived rules
 */
export const getIdentifierScope = (
	word: string,
	prevChar: string,
	nextNonSpace: string,
	afterDot: boolean,
	keywords: Map<string, string>,
	regexRules: { pattern: RegExp; scope: string }[]
): string | null => {
	// First check if it's a keyword from SCM
	const keywordScope = keywords.get(word)
	if (keywordScope) return keywordScope

	// Apply regex rules from SCM (like PascalCase → type)
	for (const rule of regexRules) {
		if (rule.pattern.test(word)) {
			// Context-sensitive refinements
			if (rule.scope === 'type' || rule.scope === 'constructor') {
				if (prevChar === ':' || prevChar === '<') return 'type'
				if (nextNonSpace === '<') return 'type'
				if (nextNonSpace === '(') return 'function'
				return 'type'
			}
			return rule.scope
		}
	}

	// SCREAMING_CASE → constant
	if (isScreamingCase(word)) return 'constant'

	// Function/method call heuristics
	if (nextNonSpace === '(') {
		return afterDot ? 'function.method' : 'function'
	}

	// Property access
	if (afterDot) return 'property'

	// Default variable
	return 'variable'
}

/**
 * Skip over an interpolation expression `${...}` handling nested template literals.
 * Assumes `i` is pointing to the first char inside the expression (after `${`).
 * Returns the index after the closing `}`.
 */
const skipInterpolation = (
	line: string,
	startIndex: number,
	len: number
): number => {
	let i = startIndex
	let depth = 1

	while (i < len && depth > 0) {
		const c = line[i]

		// Handle nested template literal
		if (c === '`') {
			i++
			while (i < len) {
				if (line[i] === '\\' && i + 1 < len) {
					i += 2
					continue
				}
				if (line[i] === '`') {
					i++
					break
				}
				if (line[i] === '$' && i + 1 < len && line[i + 1] === '{') {
					i += 2
					i = skipInterpolation(line, i, len)
					continue
				}
				i++
			}
			continue
		}

		if (c === '{') {
			depth++
			i++
			continue
		}

		if (c === '}') {
			depth--
			i++
			continue
		}

		i++
	}

	return i
}

/**
 * Tokenize a single line with the given starting state
 */
export const tokenizeLine = (
	line: string,
	state: LineState,
	keywords: Map<string, string>,
	regexRules: { pattern: RegExp; scope: string }[]
): TokenizeResult => {
	const tokens: Token[] = []
	const brackets: BracketInfo[] = []
	let lexState = state.lexState
	let bracketDepth = state.bracketDepth
	const lineStartOffset = state.offset
	let i = 0
	const len = line.length

	while (i < len) {
		const c = line[i]!
		const next = i + 1 < len ? line[i + 1] : ''

		// Handle block comment continuation
		if (lexState === LexState.BlockComment) {
			const start = i
			while (i < len) {
				if (line[i] === '*' && i + 1 < len && line[i + 1] === '/') {
					i += 2
					lexState = LexState.Normal
					break
				}
				i++
			}
			tokens.push({ start, end: i, scope: 'comment.block' })
			continue
		}

		// Handle template literal continuation
		if (lexState === LexState.Template) {
			const start = i
			while (i < len) {
				if (line[i] === '\\' && i + 1 < len) {
					i += 2
					continue
				}
				if (line[i] === '`') {
					i++
					lexState = LexState.Normal
					break
				}
				if (line[i] === '$' && i + 1 < len && line[i + 1] === '{') {
					i += 2
					i = skipInterpolation(line, i, len)
					continue
				}
				i++
			}
			if (start < i) {
				tokens.push({ start, end: i, scope: 'string' })
			}
			continue
		}

		// Line comment
		if (c === '/' && next === '/') {
			tokens.push({ start: i, end: len, scope: 'comment' })
			return {
				tokens,
				brackets,
				endState: {
					lexState: LexState.Normal,
					bracketDepth,
					offset: lineStartOffset + len + 1,
				},
			}
		}

		// Block comment start
		if (c === '/' && next === '*') {
			const start = i
			i += 2
			let foundCloser = false
			while (i < len) {
				if (line[i] === '*' && i + 1 < len && line[i + 1] === '/') {
					i += 2
					foundCloser = true
					break
				}
				i++
			}
			tokens.push({ start, end: i, scope: 'comment.block' })
			if (!foundCloser) {
				return {
					tokens,
					brackets,
					endState: {
						lexState: LexState.BlockComment,
						bracketDepth,
						offset: lineStartOffset + len + 1,
					},
				}
			}
			continue
		}

		// Regex literal (best-effort heuristic)
		if (c === '/' && next !== '/' && next !== '*') {
			const prevChar = peekPrevNonSpace(line, i)
			const shouldTreatAsRegex = isRegexLiteralContext(prevChar)

			if (shouldTreatAsRegex) {
				const start = i
				const { endIndex } = readRegexLiteralEnd(line, i + 1)
				i = endIndex
				tokens.push({ start, end: i, scope: 'string.regex' })
				continue
			}
		}

		// String literals
		if (c === '"' || c === "'") {
			const quote = c
			const start = i
			i++
			while (i < len) {
				if (line[i] === '\\' && i + 1 < len) {
					i += 2
					continue
				}
				if (line[i] === quote) {
					i++
					break
				}
				i++
			}
			tokens.push({ start, end: i, scope: 'string' })
			continue
		}

		// Template literal
		if (c === '`') {
			const start = i
			i++
			let foundClosingBacktick = false
			while (i < len) {
				if (line[i] === '\\' && i + 1 < len) {
					i += 2
					continue
				}
				if (line[i] === '`') {
					i++
					foundClosingBacktick = true
					break
				}
				if (line[i] === '$' && i + 1 < len && line[i + 1] === '{') {
					i += 2
					i = skipInterpolation(line, i, len)
					continue
				}
				i++
			}
			tokens.push({ start, end: i, scope: 'string' })
			if (!foundClosingBacktick) {
				return {
					tokens,
					brackets,
					endState: {
						lexState: LexState.Template,
						bracketDepth,
						offset: lineStartOffset + len + 1,
					},
				}
			}
			continue
		}

		// Numbers
		if (DIGIT.test(c) || (c === '.' && next && DIGIT.test(next))) {
			const start = i
			if (c === '0' && (next === 'x' || next === 'X')) {
				i += 2
				while (i < len && HEX_DIGIT.test(line[i]!)) i++
			} else {
				while (i < len && (DIGIT.test(line[i]!) || line[i] === '.')) i++
				if (i < len && (line[i] === 'e' || line[i] === 'E')) {
					i++
					if (i < len && (line[i] === '+' || line[i] === '-')) i++
					while (i < len && DIGIT.test(line[i]!)) i++
				}
			}
			if (i < len && line[i] === 'n') i++
			tokens.push({ start, end: i, scope: 'number' })
			continue
		}

		// Identifiers/keywords
		if (WORD_CHAR.test(c)) {
			const start = i
			while (i < len && WORD_CHAR.test(line[i]!)) i++
			const word = line.slice(start, i)
			const prevChar = peekPrevNonSpace(line, start)
			const nextChar = peekNextNonSpace(line, i, len)
			const afterDot = prevChar === '.'

			const scope = getIdentifierScope(
				word,
				prevChar,
				nextChar,
				afterDot,
				keywords,
				regexRules
			)
			if (scope) {
				tokens.push({ start, end: i, scope })
			}
			continue
		}

		// JSX tag detection
		if (c === '<' && next && /[A-Z]/.test(next)) {
			i++
			const start = i
			while (i < len && WORD_CHAR.test(line[i]!)) i++
			tokens.push({ start, end: i, scope: 'type' })
			continue
		}

		// Brackets - track them for depth coloring
		if (OPEN_BRACKETS.has(c)) {
			bracketDepth++
			brackets.push({
				index: lineStartOffset + i,
				char: c,
				depth: bracketDepth,
			})
			i++
			continue
		}

		if (CLOSE_BRACKETS.has(c)) {
			const depth = bracketDepth > 0 ? bracketDepth : 1
			brackets.push({
				index: lineStartOffset + i,
				char: c,
				depth,
			})
			if (bracketDepth > 0) bracketDepth--
			i++
			continue
		}

		i++
	}

	return {
		tokens,
		brackets,
		endState: {
			lexState,
			bracketDepth,
			offset: lineStartOffset + len + 1,
		},
	}
}
