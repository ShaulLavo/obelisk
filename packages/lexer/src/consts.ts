/**
 * Lexer Constants
 */

// Bracket pair mappings
export const BRACKET_PAIRS: Record<string, string> = {
	'(': ')',
	'[': ']',
	'{': '}',
}

export const OPEN_BRACKETS = new Set(Object.keys(BRACKET_PAIRS))
export const CLOSE_BRACKETS = new Set(Object.values(BRACKET_PAIRS))

// Regex patterns for tokenization
export const WORD_CHAR = /[a-zA-Z0-9_$]/
export const DIGIT = /[0-9]/
export const HEX_DIGIT = /[0-9a-fA-F]/

// Default TypeScript/JavaScript keywords
export const DEFAULT_KEYWORDS = new Map([
	// Declarations
	['const', 'keyword.declaration'],
	['let', 'keyword.declaration'],
	['var', 'keyword.declaration'],
	['function', 'keyword.declaration'],
	['class', 'keyword.declaration'],
	['enum', 'keyword.declaration'],
	// Imports/exports
	['import', 'keyword.import'],
	['export', 'keyword.import'],
	['from', 'keyword.import'],
	['as', 'keyword.import'],
	['default', 'keyword.import'],
	// Type keywords
	['type', 'keyword.type'],
	['interface', 'keyword.type'],
	['extends', 'keyword.type'],
	['implements', 'keyword.type'],
	// Control flow
	['if', 'keyword.control'],
	['else', 'keyword.control'],
	['return', 'keyword.control'],
	['for', 'keyword.control'],
	['while', 'keyword.control'],
	['do', 'keyword.control'],
	['switch', 'keyword.control'],
	['case', 'keyword.control'],
	['break', 'keyword.control'],
	['continue', 'keyword.control'],
	['try', 'keyword.control'],
	['catch', 'keyword.control'],
	['finally', 'keyword.control'],
	['throw', 'keyword.control'],
	['await', 'keyword.control'],
	['async', 'keyword.control'],
	['yield', 'keyword.control'],
	// Operators
	['new', 'keyword.operator'],
	['typeof', 'keyword.operator'],
	['instanceof', 'keyword.operator'],
	['delete', 'keyword.operator'],
	['void', 'keyword.operator'],
	['in', 'keyword.operator'],
	['of', 'keyword.operator'],
	// Modifiers
	['private', 'keyword.modifier'],
	['public', 'keyword.modifier'],
	['protected', 'keyword.modifier'],
	['static', 'keyword.modifier'],
	['readonly', 'keyword.modifier'],
	['abstract', 'keyword.modifier'],
	['override', 'keyword.modifier'],
	// Other keywords
	['get', 'keyword'],
	['set', 'keyword'],
	['super', 'constant.builtin'],
	// Built-in values
	['true', 'constant.builtin'],
	['false', 'constant.builtin'],
	['null', 'constant.builtin'],
	['undefined', 'constant.builtin'],
	['this', 'constant.builtin'],
	['NaN', 'constant.builtin'],
	['Infinity', 'constant.builtin'],
])

export const DEFAULT_REGEX_RULES = [{ pattern: /^[A-Z]/, scope: 'type' }] // PascalCase
