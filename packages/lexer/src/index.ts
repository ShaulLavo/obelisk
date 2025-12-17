/**
 * @repo/lexer
 *
 * Standalone syntax highlighting engine with SCM query support.
 */

// Main class export
export { Lexer, type LineHighlightSegment } from './lexer'

// Type exports
export {
	LexState,
	type Token,
	type LineState,
	type TokenizeResult,
	type BracketInfo,
	type ScmRules,
} from './types'

// SCM parser exports
export { parseScmQuery, mergeScmRules } from './scmParser'

// Tokenizer exports (for advanced use)
export { tokenizeLine, getIdentifierScope } from './tokenizer'
