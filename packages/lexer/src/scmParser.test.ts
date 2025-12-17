import { describe, test, expect } from 'bun:test'
import { parseScmQuery, mergeScmRules } from './scmParser'

describe('scmParser', () => {
	describe('parseScmQuery', () => {
		test('extracts keywords from bracket lists', () => {
			const source = `
				["const" "let" "var"] @keyword.declaration
			`
			const rules = parseScmQuery(source)

			expect(rules.keywords.get('const')).toBe('keyword.declaration')
			expect(rules.keywords.get('let')).toBe('keyword.declaration')
			expect(rules.keywords.get('var')).toBe('keyword.declaration')
		})

		test('extracts multiple keyword groups with different scopes', () => {
			const source = `
				["const" "let"] @keyword.declaration
				["import" "export"] @keyword.import
			`
			const rules = parseScmQuery(source)

			expect(rules.keywords.get('const')).toBe('keyword.declaration')
			expect(rules.keywords.get('import')).toBe('keyword.import')
			expect(rules.keywords.get('export')).toBe('keyword.import')
		})

		test('extracts regex predicates from #match?', () => {
			const source = `
				((identifier) @type
				 (#match? @type "^[A-Z]"))
			`
			const rules = parseScmQuery(source)

			expect(rules.regexRules.length).toBe(1)
			expect(rules.regexRules[0]!.scope).toBe('type')
			expect(rules.regexRules[0]!.pattern.test('Foo')).toBe(true)
			expect(rules.regexRules[0]!.pattern.test('foo')).toBe(false)
		})

		test('extracts simple node types', () => {
			const source = `
				(string) @string
				(comment) @comment
				(number) @number
			`
			const rules = parseScmQuery(source)

			expect(rules.nodeTypes.get('string')).toBe('string')
			expect(rules.nodeTypes.get('comment')).toBe('comment')
			expect(rules.nodeTypes.get('number')).toBe('number')
		})

		test('ignores comments', () => {
			const source = `
				; This is a comment
				["const"] @keyword.declaration ; inline comment
			`
			const rules = parseScmQuery(source)

			expect(rules.keywords.get('const')).toBe('keyword.declaration')
			expect(rules.keywords.size).toBe(1)
		})

		test('handles escaped quotes in strings', () => {
			const source = `
				["\\""] @string
			`
			const rules = parseScmQuery(source)

			expect(rules.keywords.has('"')).toBe(false) // not a valid keyword
		})

		test('handles complex nested patterns', () => {
			const source = `
				(function_declaration
				  name: (identifier) @function)
			`
			const rules = parseScmQuery(source)

			// This is an AST pattern, should extract the capture but not as simple node type
			// Since it has field names (name:), it won't be extracted as a simple node type
			expect(rules.nodeTypes.has('function_declaration')).toBe(false)
		})

		test('handles real typescript highlights excerpt', () => {
			const source = `
				; Declaration Keywords
				[
				  "const"
				  "let"
				  "var"
				  "function"
				  "class"
				] @keyword.declaration

				; Import/Export Keywords
				[
				  "import"
				  "export"
				  "from"
				  "as"
				  "default"
				] @keyword.import

				((identifier) @type
				 (#match? @type "^[A-Z]"))

				(string) @string
				(number) @number
			`
			const rules = parseScmQuery(source)

			// Keywords
			expect(rules.keywords.get('const')).toBe('keyword.declaration')
			expect(rules.keywords.get('function')).toBe('keyword.declaration')
			expect(rules.keywords.get('import')).toBe('keyword.import')
			expect(rules.keywords.get('from')).toBe('keyword.import')

			// Regex
			expect(rules.regexRules.length).toBe(1)
			expect(rules.regexRules[0]!.pattern.test('MyComponent')).toBe(true)

			// Node types
			expect(rules.nodeTypes.get('string')).toBe('string')
			expect(rules.nodeTypes.get('number')).toBe('number')
		})
	})

	describe('mergeScmRules', () => {
		test('merges keywords from multiple rules', () => {
			const rules1 = parseScmQuery('["const"] @keyword.declaration')
			const rules2 = parseScmQuery('["import"] @keyword.import')

			const merged = mergeScmRules(rules1, rules2)

			expect(merged.keywords.get('const')).toBe('keyword.declaration')
			expect(merged.keywords.get('import')).toBe('keyword.import')
		})

		test('later rules override earlier ones', () => {
			const rules1 = parseScmQuery('["type"] @keyword')
			const rules2 = parseScmQuery('["type"] @keyword.type')

			const merged = mergeScmRules(rules1, rules2)

			expect(merged.keywords.get('type')).toBe('keyword.type')
		})

		test('combines regex rules', () => {
			const rules1 = parseScmQuery(
				'((identifier) @type (#match? @type "^[A-Z]"))'
			)
			const rules2 = parseScmQuery(
				'((identifier) @constant (#match? @constant "^[A-Z_]+$"))'
			)

			const merged = mergeScmRules(rules1, rules2)

			expect(merged.regexRules.length).toBe(2)
		})
	})
})
