import type { FoldRange } from '@repo/code-editor'
export type { FoldRange }
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
//# sourceMappingURL=treeSitterWorkerTypes.d.ts.map
