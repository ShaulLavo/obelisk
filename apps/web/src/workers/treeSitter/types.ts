// Re-export all public types from the worker types file
export type {
	TreeSitterWorkerApi,
	TreeSitterEditPayload,
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	TreeSitterParseResult,
	TreeSitterPoint,
	FoldRange,
	MinimapTokenSummary,
} from '../treeSitterWorkerTypes'

import type { Tree } from 'web-tree-sitter'

// Internal types used within the worker
export type CachedTreeEntry = {
	tree: Tree
	text: string
	captures?: import('../treeSitterWorkerTypes').TreeSitterCapture[]
	brackets?: import('../treeSitterWorkerTypes').BracketInfo[]
	folds?: import('../treeSitterWorkerTypes').FoldRange[]
	languageId: string
}

export type LanguageId =
	| 'typescript'
	| 'tsx'
	| 'javascript'
	| 'jsx'
	| 'json'
	| 'html'
	| 'markdown'

// Type alias for SyntaxNode (not directly exported from web-tree-sitter)
export type SyntaxNode = ReturnType<Tree['rootNode']['child']>
