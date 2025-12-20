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

	describe('Numeric Literals', () => {
		test('should handle valid numeric literals', () => {
			const inputs = [
				'123',
				'123.456',
				'0.123',
				'.456',
				'123n',
				'123e5',
				'123.456e-5',
				'0x1A',
				'0x2b',
			]
			inputs.forEach((input) => {
				const result = tokenize(input)
				expect(result.tokens).toHaveLength(1)
				expect(result.tokens[0]!.scope).toBe('number')
				expect(result.tokens[0]!.end).toBe(input.length)
			})
		})

		test('should stop parsing number after second decimal point', () => {
			const line = '1.2.3'
			const result = tokenize(line)

			// With the bug, this was 1 token (1.2.3).
			// With the fix, it should likely be 2 tokens: "1.2" and ".3"
			expect(result.tokens).toHaveLength(2)
			expect(result.tokens[0]!).toMatchObject({
				start: 0,
				end: 3,
				scope: 'number',
			})
			expect(result.tokens[1]!).toMatchObject({
				start: 3,
				end: 5,
				scope: 'number',
			})
		})
	})

	describe('JSX Tags', () => {
		test('should tokenize opening bracket of JSX tag', () => {
			const line = '<MyComponent />'
			const result = tokenize(line)

			// Should have at least: <, MyComponent, /, >
			// The bug is that `<` is skipped.
			expect(result.tokens[0]!).toMatchObject({
				start: 0,
				end: 1,
				scope: 'punctuation.bracket',
			})
			expect(result.tokens[1]!).toMatchObject({
				start: 1,
				end: 12, // < (1) + MyComponent (11) = 12
				scope: 'type',
			})
		})
	})
})
