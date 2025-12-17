import { describe, test, expect } from 'bun:test'
import { Lexer, LexState } from './lexer'

const quickTokenizeLine = (line: string, state?: any) => {
	const lineState =
		state !== undefined
			? { lexState: state, bracketDepth: 0, offset: 0 }
			: undefined
	const result = Lexer.create().tokenizeLine(line, lineState)
	// Shim for tests expecting simple LexState return
	return { ...result, endState: result.endState.lexState }
}
import { parseScmQuery } from './scmParser'

describe('quickLexer', () => {
	describe('quickTokenizeLine (default rules)', () => {
		test('tokenizes keywords correctly', () => {
			const result = quickTokenizeLine('const foo = 42')

			expect(result.tokens.length).toBeGreaterThan(0)
			const constToken = result.tokens.find(
				(t) => t.scope === 'keyword.declaration'
			)
			expect(constToken).toBeDefined()
			expect(constToken!.start).toBe(0)
			expect(constToken!.end).toBe(5)
		})

		test('tokenizes strings', () => {
			const result = quickTokenizeLine('"hello world"')

			expect(result.tokens.length).toBe(1)
			expect(result.tokens[0]!.scope).toBe('string')
			expect(result.tokens[0]!.start).toBe(0)
			expect(result.tokens[0]!.end).toBe(13)
		})

		test('tokenizes template literals', () => {
			const result = quickTokenizeLine('`hello ${name}`')

			expect(result.tokens.length).toBeGreaterThan(0)
			const stringToken = result.tokens.find((t) => t.scope === 'string')
			expect(stringToken).toBeDefined()
		})

		test('tokenizes line comments', () => {
			const result = quickTokenizeLine('// this is a comment')

			expect(result.tokens.length).toBe(1)
			expect(result.tokens[0]!.scope).toBe('comment')
			expect(result.tokens[0]!.start).toBe(0)
			expect(result.tokens[0]!.end).toBe(20)
		})

		test('tokenizes block comments', () => {
			const result = quickTokenizeLine('/* block */')

			expect(result.tokens.length).toBe(1)
			expect(result.tokens[0]!.scope).toBe('comment.block')
		})

		test('tokenizes numbers', () => {
			const result = quickTokenizeLine('42 + 3.14')

			const numbers = result.tokens.filter((t) => t.scope === 'number')
			expect(numbers.length).toBe(2)
		})

		test('tokenizes function calls', () => {
			const result = quickTokenizeLine('foo()')

			const funcToken = result.tokens.find((t) => t.scope === 'function')
			expect(funcToken).toBeDefined()
		})

		test('tokenizes method calls', () => {
			const result = quickTokenizeLine('obj.method()')

			const methodToken = result.tokens.find(
				(t) => t.scope === 'function.method'
			)
			expect(methodToken).toBeDefined()
		})

		test('tokenizes PascalCase as type', () => {
			const result = quickTokenizeLine('MyComponent')

			const typeToken = result.tokens.find((t) => t.scope === 'type')
			expect(typeToken).toBeDefined()
		})

		test('does not tokenize keywords inside strings', () => {
			const result = quickTokenizeLine('"const let var"')

			expect(result.tokens.length).toBe(1)
			expect(result.tokens[0]!.scope).toBe('string')
		})

		test('handles escaped quotes in strings', () => {
			const result = quickTokenizeLine('"hello \\"world\\""')

			expect(result.tokens.length).toBe(1)
			expect(result.tokens[0]!.scope).toBe('string')
		})

		test('handles multi-line block comment state', () => {
			const result = quickTokenizeLine('/* start of comment')

			expect(result.endState).toBe(LexState.BlockComment)
		})

		test('continues block comment from previous line', () => {
			const result = quickTokenizeLine(
				'end of comment */',
				LexState.BlockComment
			)

			expect(result.tokens.length).toBe(1)
			expect(result.tokens[0]!.scope).toBe('comment.block')
			expect(result.endState).toBe(LexState.Normal)
		})
	})

	describe('Lexer with custom SCM rules', () => {
		test('uses keywords from SCM', () => {
			const rules = parseScmQuery('["myKeyword"] @custom.scope')
			const lexer = Lexer.create(rules)

			const result = lexer.tokenizeLine('myKeyword foo')

			const customToken = result.tokens.find((t) => t.scope === 'custom.scope')
			expect(customToken).toBeDefined()
		})

		test('applies regex rules from SCM', () => {
			const rules = parseScmQuery(
				'((identifier) @special (#match? @special "^_"))'
			)
			const lexer = Lexer.create(rules)

			const result = lexer.tokenizeLine('_private normal')

			const specialToken = result.tokens.find((t) => t.scope === 'special')
			expect(specialToken).toBeDefined()
		})
	})
})
