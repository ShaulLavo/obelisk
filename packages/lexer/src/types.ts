/**
 * Lexer Types
 */

/**
 * Bracket info for depth coloring
 */
export type BracketInfo = {
	index: number
	char: string
	depth: number
}

/**
 * Lexer token output
 */
export type Token = {
	start: number
	end: number
	scope: string
}

/**
 * Lexer states for tracking multi-line constructs
 */
export const enum LexState {
	Normal,
	String,
	Template,
	LineComment,
	BlockComment,
}

/**
 * State at the start of a line, used for incremental lexing
 */
export type LineState = {
	lexState: LexState
	bracketDepth: number
	offset: number // document offset at line start
}

/**
 * Result of tokenizing a line
 */
export type TokenizeResult = {
	tokens: Token[]
	brackets: BracketInfo[]
	endState: LineState
}

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
