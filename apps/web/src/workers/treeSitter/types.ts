import type { FoldRange } from '@repo/code-editor'
import type { MinimapTokenSummary } from '@repo/code-editor/tokenSummary'
import type { Tree } from 'web-tree-sitter'

export type { FoldRange, MinimapTokenSummary }

export type TreeSitterCapture = {
	startIndex: number
	endIndex: number
	scope: string
	className?: string
}

export type BracketInfo = {
	index: number
	char: string
	depth: number
}

export type TreeSitterError = {
	startIndex: number
	endIndex: number
	message: string
	isMissing: boolean
}

export type TreeSitterParseResult = {
	captures: TreeSitterCapture[]
	brackets: BracketInfo[]
	errors: TreeSitterError[]
	folds: FoldRange[]
}

export type TreeSitterWorkerApi = {
	init(): Promise<void>
	parse(source: string): Promise<TreeSitterParseResult | undefined>
	parseBuffer(payload: {
		path: string
		buffer: ArrayBuffer
	}): Promise<TreeSitterParseResult | undefined>
	applyEdit(
		payload: TreeSitterEditPayload
	): Promise<TreeSitterParseResult | undefined>
	applyEditBatch(payload: {
		path: string
		edits: Omit<TreeSitterEditPayload, 'path'>[]
	}): Promise<TreeSitterParseResult | undefined>
	subscribeMinimapReady(callback: (payload: { path: string }) => void): number
	unsubscribeMinimapReady(id: number): void
	getMinimapSummary(payload: {
		path: string
		version: number
		maxChars?: number
	}): Promise<MinimapTokenSummary | undefined>
	getMinimapSummaryFromText(payload: {
		text: string
		version: number
		maxChars?: number
	}): Promise<MinimapTokenSummary>
	dispose(): Promise<void>
}

export type TreeSitterPoint = {
	row: number
	column: number
}

export type TreeSitterEditPayload = {
	path: string
	startIndex: number
	oldEndIndex: number
	newEndIndex: number
	startPosition: TreeSitterPoint
	oldEndPosition: TreeSitterPoint
	newEndPosition: TreeSitterPoint
	insertedText: string
}

export type CachedTreeEntry = {
	tree: Tree
	text: string
	captures?: TreeSitterCapture[]
	brackets?: BracketInfo[]
	folds?: FoldRange[]
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
	| 'xml'

export type SyntaxNode = ReturnType<Tree['rootNode']['child']>
