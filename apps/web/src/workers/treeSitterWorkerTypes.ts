import type { FoldRange } from '@repo/code-editor'
import type { MinimapTokenSummary } from '@repo/code-editor/tokenSummary'

export type { FoldRange, MinimapTokenSummary }

export type TreeSitterCapture = {
	startIndex: number
	endIndex: number
	captureName: string
}

export type BracketInfo = {
	index: number
	char: string
	depth: number
}

export type TreeSitterError = {
	startIndex: number
	endIndex: number
	message: string // Might be useful if we can get it, otherwise just type
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
	subscribeMinimapReady(callback: (payload: { path: string }) => void): () => void
	/** Get compact minimap token summary for a cached file */
	getMinimapSummary(payload: {
		path: string
		version: number
		maxChars?: number
	}): Promise<MinimapTokenSummary | undefined>
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
