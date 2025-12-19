import { describe, test, expect } from 'vitest'
import { tokenizeLine } from './tokenizer'
import { LexState, type LineState } from './types'

describe('Tokenizer', () => {
	const initialState: LineState = {
		lexState: LexState.Normal,
		bracketDepth: 0,
		offset: 0,
	}
	const keywords = new Map<string, string>()
	const regexRules: { pattern: RegExp; scope: string }[] = []

	const tokenize = (line: string, state: LineState = initialState) => {
		return tokenizeLine(line, state, keywords, regexRules)
	}

	describe('Template Literals', () => {
		test('should handle nested template literal with closing brace inside interpolation', () => {
			// Case: `outer ${ `}` }`
			// The `}` inside the nested template should not close the interpolation
			const line = '`outer ${ `}` }`'
			const result = tokenize(line)

			expect(result.tokens).toHaveLength(1)
			expect(result.tokens[0]!.scope).toBe('string')
			expect(result.tokens[0]!.start).toBe(0)
			expect(result.tokens[0]!.end).toBe(line.length)
		})

		test('should handle complex nested template literals', () => {
			const line = '`outer ${ `nested ${ "deep" }` }`'
			const result = tokenize(line)

			expect(result.tokens).toHaveLength(1)
			expect(result.tokens[0]!.scope).toBe('string')
			expect(result.tokens[0]!.end).toBe(line.length)
		})

		test('should handle unbalanced braces inside nested template strings', () => {
			// `a ${ ` { ` } b`
			// The nested template ` { ` contains an open brace.
			// Should be ignored.
			const line = '`a ${ ` { ` } b`'
			const result = tokenize(line)

			expect(result.tokens).toHaveLength(1)
			expect(result.tokens[0]!.end).toBe(line.length)
		})

		test('should handle doubly nested template literals', () => {
			// `a ${ `b ${c} d` } e`
			const line = '`a ${ `b ${c} d` } e`'
			const result = tokenize(line)

			expect(result.tokens).toHaveLength(1)
			expect(result.tokens[0]!.scope).toBe('string')
			expect(result.tokens[0]!.end).toBe(line.length)
		})

		test('should handle deep nesting', () => {
			// `outer ${ `inner ${ `deep` }` }`
			const line = '`outer ${ `inner ${ `deep` }` }`'
			const result = tokenize(line)

			expect(result.tokens).toHaveLength(1)
			expect(result.tokens[0]!.end).toBe(line.length)
		})
	})
})
