import type { FsTreeNode } from '@repo/fs'
export declare const createFsState: () => {
	state: {
		tree: import('@repo/fs').FsDirTreeNode
		expanded: Record<string, boolean>
		fileStats: Record<string, import('@repo/utils').ParseResult | undefined>
		pieceTables: Record<
			string,
			| import('node_modules/@repo/utils/src/pieceTable/pieceTableTypes').PieceTableTreeSnapshot
			| undefined
		>
		fileHighlights: Record<
			string,
			| import('../../workers/treeSitterWorkerTypes').TreeSitterCapture[]
			| undefined
		>
		fileFolds: Record<
			string,
			import('@repo/code-editor').FoldRange[] | undefined
		>
		fileBrackets: Record<
			string,
			import('../../workers/treeSitterWorkerTypes').BracketInfo[] | undefined
		>
		fileErrors: Record<
			string,
			| import('../../workers/treeSitterWorkerTypes').TreeSitterError[]
			| undefined
		>
		readonly selectedPath: string | undefined
		readonly selectedFileLoading: boolean
		readonly activeSource: import('../types').FsSource
		readonly selectedFileContent: string
		readonly selectedFileSize: number | undefined
		readonly selectedFilePreviewBytes: Uint8Array<ArrayBufferLike> | undefined
		readonly error: string | undefined
		readonly loading: boolean
		readonly backgroundPrefetching: boolean
		readonly backgroundIndexedFileCount: number
		readonly lastPrefetchedPath: string | undefined
		readonly prefetchError: string | undefined
		readonly prefetchProcessedCount: number
		readonly prefetchLastDurationMs: number
		readonly prefetchAverageDurationMs: number
		readonly deferredMetadata: Record<
			string,
			import('../prefetch/treePrefetchWorkerTypes').DeferredDirMetadata
		>
		readonly selectedFileStats: import('@repo/utils').ParseResult | undefined
		readonly selectedFilePieceTable:
			| import('node_modules/@repo/utils/src/pieceTable/pieceTableTypes').PieceTableTreeSnapshot
			| undefined
		readonly selectedFileHighlights:
			| import('../../workers/treeSitterWorkerTypes').TreeSitterCapture[]
			| undefined
		readonly selectedFileFolds:
			| import('@repo/code-editor').FoldRange[]
			| undefined
		readonly selectedFileBrackets:
			| import('../../workers/treeSitterWorkerTypes').BracketInfo[]
			| undefined
		readonly selectedFileErrors:
			| import('../../workers/treeSitterWorkerTypes').TreeSitterError[]
			| undefined
		readonly selectedNode: FsTreeNode | undefined
		readonly lastKnownFileNode: FsTreeNode | undefined
		readonly lastKnownFilePath: string | undefined
	}
	setTree: import('solid-js/store').SetStoreFunction<
		import('@repo/fs').FsDirTreeNode
	>
	setExpanded: import('solid-js/store').SetStoreFunction<
		Record<string, boolean>
	>
	setSelectedPath: import('solid-js').Setter<string | undefined>
	setActiveSource: import('solid-js').Setter<import('../types').FsSource>
	setSelectedFileSize: import('solid-js').Setter<number | undefined>
	setSelectedFilePreviewBytes: import('solid-js').Setter<
		Uint8Array<ArrayBufferLike> | undefined
	>
	setSelectedFileContent: import('solid-js').Setter<string>
	setSelectedFileLoading: import('solid-js').Setter<boolean>
	setError: import('solid-js').Setter<string | undefined>
	setLoading: import('solid-js').Setter<boolean>
	setBackgroundPrefetching: import('solid-js').Setter<boolean>
	setBackgroundIndexedFileCount: import('solid-js').Setter<number>
	setLastPrefetchedPath: import('solid-js').Setter<string | undefined>
	setPrefetchError: import('solid-js').Setter<string | undefined>
	setPrefetchProcessedCount: import('solid-js').Setter<number>
	setPrefetchLastDurationMs: import('solid-js').Setter<number>
	setPrefetchAverageDurationMs: import('solid-js').Setter<number>
	registerDeferredMetadata: (
		node: import('../prefetch/treePrefetchWorkerTypes').DeferredDirMetadata
	) => void
	clearDeferredMetadata: () => void
	setFileStats: (
		path: string,
		result?: import('@repo/utils').ParseResult
	) => void
	clearParseResults: () => void
	setPieceTable: (
		path: string,
		snapshot?: import('@repo/utils').PieceTableSnapshot
	) => void
	clearPieceTables: () => void
	setHighlights: (
		path: string,
		highlights?: import('../../workers/treeSitterWorkerTypes').TreeSitterCapture[]
	) => void
	clearHighlights: () => void
	setFolds: (
		path: string,
		folds?: import('@repo/code-editor').FoldRange[]
	) => void
	clearFolds: () => void
	setBrackets: (
		path: string,
		brackets?: import('../../workers/treeSitterWorkerTypes').BracketInfo[]
	) => void
	clearBrackets: () => void
	setErrors: (
		path: string,
		errors?: import('../../workers/treeSitterWorkerTypes').TreeSitterError[]
	) => void
	clearErrors: () => void
}
//# sourceMappingURL=createFsState.d.ts.map
