/**
 * SCM Query Parser
 * Parses tree-sitter .scm highlight query files and extracts rules for quick lexing.
 */

import safeRegex from 'safe-regex'
import { loggers } from '@repo/logger'

const scmLogger = loggers.codeEditor.withTag('scmParser')

/**
 * Extracted rules from SCM query files
 */
export type ScmRules = {
	/** Literal keywords mapped to their scope: "const" → "keyword.declaration" */
	keywords: Map<string, string>
	/** Regex patterns for identifier classification */
	regexRules: Array<{ pattern: RegExp; scope: string }>
	/** Node type to scope mappings for special syntax (string, comment, etc.) */
	nodeTypes: Map<string, string>
}

/**
 * Token types for S-expression parsing
 */
type TokenType =
	| 'LPAREN'
	| 'RPAREN'
	| 'LBRACKET'
	| 'RBRACKET'
	| 'STRING'
	| 'SYMBOL'
	| 'CAPTURE'
	| 'PREDICATE'
	| 'EOF'

type Token = {
	type: TokenType
	value: string
	start: number
	end: number
}

/**
 * Tokenize SCM source into tokens
 */
const tokenize = (source: string): Token[] => {
	const tokens: Token[] = []
	let i = 0
	const len = source.length

	while (i < len) {
		const c = source[i]!

		// Skip whitespace
		if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
			i++
			continue
		}

		// Skip comments
		if (c === ';') {
			while (i < len && source[i] !== '\n') i++
			continue
		}

		// Parentheses
		if (c === '(') {
			tokens.push({ type: 'LPAREN', value: '(', start: i, end: i + 1 })
			i++
			continue
		}
		if (c === ')') {
			tokens.push({ type: 'RPAREN', value: ')', start: i, end: i + 1 })
			i++
			continue
		}

		// Brackets
		if (c === '[') {
			tokens.push({ type: 'LBRACKET', value: '[', start: i, end: i + 1 })
			i++
			continue
		}
		if (c === ']') {
			tokens.push({ type: 'RBRACKET', value: ']', start: i, end: i + 1 })
			i++
			continue
		}

		// Quoted strings
		if (c === '"') {
			const start = i
			i++ // skip opening quote
			let value = ''
			while (i < len && source[i] !== '"') {
				if (source[i] === '\\' && i + 1 < len) {
					value += source[i + 1]
					i += 2
				} else {
					value += source[i]
					i++
				}
			}
			// Only skip closing quote if we found one (not an unterminated string)
			if (i < len && source[i] === '"') {
				i++
			}
			tokens.push({ type: 'STRING', value, start, end: i })
			continue
		}

		// Capture names (@something)
		if (c === '@') {
			const start = i
			i++ // skip @
			while (i < len && /[a-zA-Z0-9._-]/.test(source[i]!)) i++
			tokens.push({
				type: 'CAPTURE',
				value: source.slice(start + 1, i),
				start,
				end: i,
			})
			continue
		}

		// Predicates (#something)
		if (c === '#') {
			const start = i
			i++ // skip #
			while (i < len && /[a-zA-Z0-9_?!-]/.test(source[i]!)) i++
			tokens.push({
				type: 'PREDICATE',
				value: source.slice(start + 1, i),
				start,
				end: i,
			})
			continue
		}

		// Symbols (identifiers, node types)
		if (/[a-zA-Z_]/.test(c)) {
			const start = i
			while (i < len && /[a-zA-Z0-9_]/.test(source[i]!)) i++
			// Check for field name (with colon)
			if (i < len && source[i] === ':') {
				i++ // include the colon
				tokens.push({
					type: 'SYMBOL',
					value: source.slice(start, i),
					start,
					end: i,
				})
			} else {
				tokens.push({
					type: 'SYMBOL',
					value: source.slice(start, i),
					start,
					end: i,
				})
			}
			continue
		}

		// Skip unknown characters
		i++
	}

	tokens.push({ type: 'EOF', value: '', start: len, end: len })
	return tokens
}

/**
 * AST node types for parsed S-expressions
 */
type SExpr =
	| { type: 'list'; items: SExpr[] }
	| { type: 'bracket'; items: SExpr[] }
	| { type: 'string'; value: string }
	| { type: 'symbol'; value: string }
	| { type: 'capture'; value: string }
	| { type: 'predicate'; name: string; args: SExpr[] }

/**
 * Parse tokens into S-expressions
 */
const parse = (tokens: Token[]): SExpr[] => {
	let pos = 0

	const current = (): Token =>
		tokens[pos] ?? { type: 'EOF', value: '', start: 0, end: 0 }
	const advance = (): Token =>
		tokens[pos++] ?? { type: 'EOF', value: '', start: 0, end: 0 }

	const parseExpr = (): SExpr | null => {
		const tok = current()

		if (tok.type === 'LPAREN') {
			advance() // skip (
			const items: SExpr[] = []
			while (current().type !== 'RPAREN' && current().type !== 'EOF') {
				// Check for predicate
				if (current().type === 'PREDICATE') {
					const predTok = advance()
					const args: SExpr[] = []
					// Collect arguments until closing paren
					while (current().type !== 'RPAREN' && current().type !== 'EOF') {
						const arg = parseExpr()
						if (arg) args.push(arg)
					}
					items.push({ type: 'predicate', name: predTok.value, args })
				} else {
					const item = parseExpr()
					if (item) items.push(item)
				}
			}
			advance() // skip )
			return { type: 'list', items }
		}

		if (tok.type === 'LBRACKET') {
			advance() // skip [
			const items: SExpr[] = []
			while (current().type !== 'RBRACKET' && current().type !== 'EOF') {
				const item = parseExpr()
				if (item) items.push(item)
			}
			advance() // skip ]
			return { type: 'bracket', items }
		}

		if (tok.type === 'STRING') {
			advance()
			return { type: 'string', value: tok.value }
		}

		if (tok.type === 'SYMBOL') {
			advance()
			return { type: 'symbol', value: tok.value }
		}

		if (tok.type === 'CAPTURE') {
			advance()
			return { type: 'capture', value: tok.value }
		}

		if (tok.type === 'PREDICATE') {
			// Standalone predicate (shouldn't happen in valid SCM, but handle it)
			advance()
			return { type: 'predicate', name: tok.value, args: [] }
		}

		return null
	}

	const exprs: SExpr[] = []
	while (current().type !== 'EOF') {
		const expr = parseExpr()
		if (expr) exprs.push(expr)
	}

	return exprs
}

/**
 * Find capture name in an expression
 */
const findCapture = (expr: SExpr): string | null => {
	if (expr.type === 'capture') return expr.value
	if (expr.type === 'list') {
		for (const item of expr.items) {
			const found = findCapture(item)
			if (found) return found
		}
	}
	if (expr.type === 'bracket') {
		for (const item of expr.items) {
			const found = findCapture(item)
			if (found) return found
		}
	}
	return null
}

/**
 * Extract string literals from an expression
 */
const extractStrings = (expr: SExpr): string[] => {
	if (expr.type === 'string') return [expr.value]
	if (expr.type === 'bracket') {
		return expr.items.flatMap(extractStrings)
	}
	if (expr.type === 'list') {
		return expr.items.flatMap(extractStrings)
	}
	return []
}

/**
 * Find #match? predicates and extract their patterns
 */
const findMatchPredicate = (
	exprs: SExpr[]
): { captureName: string; pattern: string } | null => {
	for (const expr of exprs) {
		if (expr.type === 'predicate' && expr.name === 'match?') {
			// Args should be: capture, pattern string
			if (expr.args.length >= 2) {
				const captureArg = expr.args[0]
				const patternArg = expr.args[1]
				if (captureArg?.type === 'capture' && patternArg?.type === 'string') {
					return { captureName: captureArg.value, pattern: patternArg.value }
				}
			}
		}
		// Also check inside lists
		if (expr.type === 'list') {
			const found = findMatchPredicate(expr.items)
			if (found) return found
		}
	}
	return null
}

/**
 * Check if expression is a simple node type pattern like (string) or (identifier)
 */
const isSimpleNodeType = (expr: SExpr): string | null => {
	if (expr.type === 'list' && expr.items.length >= 1) {
		const first = expr.items[0]
		if (first?.type === 'symbol' && !first.value.includes(':')) {
			// Check it's just (node_type) @capture
			const hasOnlyCapture = expr.items
				.slice(1)
				.every((item) => item.type === 'capture' || item.type === 'predicate')
			if (hasOnlyCapture || expr.items.length === 1) {
				return first.value
			}
		}
	}
	return null
}

/**
 * Parse an SCM query source and extract lexer rules
 */
export const parseScmQuery = (source: string): ScmRules => {
	const tokens = tokenize(source)
	const ast = parse(tokens)

	const keywords = new Map<string, string>()
	const regexRules: Array<{ pattern: RegExp; scope: string }> = []
	const nodeTypes = new Map<string, string>()

	// Process each top-level expression
	let i = 0
	while (i < ast.length) {
		const expr = ast[i]!
		let capture: string | null = null
		let nextExpr: SExpr | null = null

		// Check if next expression is a capture
		if (i + 1 < ast.length) {
			nextExpr = ast[i + 1]!
			if (nextExpr.type === 'capture') {
				capture = nextExpr.value
				i += 2
			} else {
				// Capture might be inside the expression
				capture = findCapture(expr)
				i += 1
			}
		} else {
			capture = findCapture(expr)
			i += 1
		}

		if (!capture) continue

		// Pattern 1: Bracket with strings → keyword list
		// ["const" "let"] @keyword.declaration
		if (expr.type === 'bracket') {
			const strings = extractStrings(expr)
			for (const str of strings) {
				// Only add if it looks like a keyword (no special chars except _)
				if (/^[a-zA-Z_]+$/.test(str)) {
					keywords.set(str, capture)
				}
			}
			continue
		}

		// Pattern 2: List (possibly with predicate)
		if (expr.type === 'list') {
			// Check for #match? predicate
			const matchPred = findMatchPredicate(expr.items)
			if (matchPred) {
				try {
					// Validate pattern is safe from ReDoS before constructing RegExp
					if (!safeRegex(matchPred.pattern)) {
						// Skip unsafe patterns that could cause catastrophic backtracking
						scmLogger.warn(
							`Skipping unsafe regex pattern that could cause ReDoS: ${matchPred.pattern}`
						)
						continue
					}
					const regex = new RegExp(matchPred.pattern)
					regexRules.push({ pattern: regex, scope: capture })
				} catch (err) {
					// Invalid or unparsable regex, skip
					scmLogger.warn(
						`Skipping invalid SCM regex pattern: ${matchPred.pattern}`,
						err
					)
				}
				continue
			}

			// Check for simple node type: (string), (comment), (number)
			const nodeType = isSimpleNodeType(expr)
			if (nodeType) {
				nodeTypes.set(nodeType, capture)
			}
		}
	}

	return { keywords, regexRules, nodeTypes }
}

/**
 * Merge multiple ScmRules into one (later rules override earlier)
 */
export const mergeScmRules = (...rules: ScmRules[]): ScmRules => {
	const merged: ScmRules = {
		keywords: new Map(),
		regexRules: [],
		nodeTypes: new Map(),
	}

	for (const rule of rules) {
		for (const [k, v] of rule.keywords) {
			merged.keywords.set(k, v)
		}
		merged.regexRules.push(...rule.regexRules)
		for (const [k, v] of rule.nodeTypes) {
			merged.nodeTypes.set(k, v)
		}
	}

	return merged
}
