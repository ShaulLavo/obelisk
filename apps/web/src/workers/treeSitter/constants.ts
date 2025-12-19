import type { LanguageId } from './types'

import jsHighlightsQuerySource from '../../treeSitter/queries/javascript-highlights.scm?raw'
import jsJsxHighlightsQuerySource from 'tree-sitter-javascript/queries/highlights-jsx.scm?raw'
import tsHighlightsQuerySource from '../../treeSitter/queries/typescript-highlights.scm?raw'
import jsFoldsQuerySource from '../../treeSitter/queries/javascript-folds.scm?raw'
import tsFoldsQuerySource from '../../treeSitter/queries/typescript-folds.scm?raw'

// File extension to language ID mapping
export const EXTENSION_MAP: Record<string, LanguageId> = {
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'jsx',
	json: 'json',
	html: 'html',
	htm: 'html',
	md: 'markdown',
	mdx: 'markdown',
	markdown: 'markdown',
}

// Language configuration: wasm paths and query sources
export const LANGUAGE_CONFIG: Record<
	LanguageId,
	{
		wasm: string
		highlightQueries: string[]
		foldQueries: string[]
	}
> = {
	typescript: {
		wasm: '/tree-sitter/tree-sitter-typescript.wasm',
		highlightQueries: [tsHighlightsQuerySource, jsHighlightsQuerySource],
		foldQueries: [tsFoldsQuerySource, jsFoldsQuerySource],
	},
	tsx: {
		wasm: '/tree-sitter/tree-sitter-tsx.wasm',
		highlightQueries: [
			tsHighlightsQuerySource,
			jsHighlightsQuerySource,
			jsJsxHighlightsQuerySource,
		],
		foldQueries: [tsFoldsQuerySource, jsFoldsQuerySource],
	},
	javascript: {
		wasm: '/tree-sitter/tree-sitter-javascript.wasm',
		highlightQueries: [jsHighlightsQuerySource],
		foldQueries: [jsFoldsQuerySource],
	},
	jsx: {
		wasm: '/tree-sitter/tree-sitter-javascript.wasm',
		highlightQueries: [jsHighlightsQuerySource, jsJsxHighlightsQuerySource],
		foldQueries: [jsFoldsQuerySource],
	},
	json: {
		wasm: '/tree-sitter/tree-sitter-json.wasm',
		highlightQueries: ['/tree-sitter/json-highlights.scm'],
		foldQueries: [],
	},
	html: {
		wasm: '/tree-sitter/tree-sitter-html.wasm',
		highlightQueries: ['/tree-sitter/html-highlights.scm'],
		foldQueries: [],
	},
	markdown: {
		wasm: '/tree-sitter/tree-sitter-markdown.wasm',
		highlightQueries: ['/tree-sitter/markdown-highlights.scm'],
		foldQueries: [],
	},
}

// Bracket type definitions
export const BRACKET_PAIRS: Record<string, string> = {
	'(': ')',
	'[': ']',
	'{': '}',
}

export const OPEN_BRACKETS = new Set(Object.keys(BRACKET_PAIRS))
export const CLOSE_BRACKETS = new Set(Object.values(BRACKET_PAIRS))

// Utility functions
export const locateWasm = () => '/tree-sitter/tree-sitter.wasm'

export const detectLanguage = (path: string): LanguageId | undefined => {
	const ext = path.split('.').pop()?.toLowerCase()
	return ext ? EXTENSION_MAP[ext] : undefined
}
