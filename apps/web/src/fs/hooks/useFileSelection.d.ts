import type { PieceTableSnapshot } from '@repo/utils'
import type { FsState } from '../types'
import type { SelectPathOptions } from '../context/FsContext'
import type { FileCacheController } from '../cache/fileCacheController'
type UseFileSelectionOptions = {
	state: FsState
	setSelectedPath: (path: string | undefined) => void
	setSelectedFileSize: (size: number | undefined) => void
	setSelectedFilePreviewBytes: (bytes: Uint8Array | undefined) => void
	setSelectedFileContent: (content: string) => void
	setSelectedFileLoading: (value: boolean) => void
	setError: (message: string | undefined) => void
	fileCache: FileCacheController
}
export declare const useFileSelection: ({
	state,
	setSelectedPath,
	setSelectedFileSize,
	setSelectedFilePreviewBytes,
	setSelectedFileContent,
	setSelectedFileLoading,
	setError,
	fileCache,
}: UseFileSelectionOptions) => {
	selectPath: (path: string, options?: SelectPathOptions) => Promise<void>
	updateSelectedFilePieceTable: (
		updater: (
			current: PieceTableSnapshot | undefined
		) => PieceTableSnapshot | undefined
	) => void
	updateSelectedFileHighlights: (
		highlights:
			| import('../../workers/treeSitterWorkerTypes').TreeSitterCapture[]
			| undefined
	) => void
	updateSelectedFileFolds: (
		folds: import('@repo/code-editor').FoldRange[] | undefined
	) => void
	updateSelectedFileBrackets: (
		brackets:
			| import('../../workers/treeSitterWorkerTypes').BracketInfo[]
			| undefined
	) => void
	updateSelectedFileErrors: (
		errors:
			| import('../../workers/treeSitterWorkerTypes').TreeSitterError[]
			| undefined
	) => void
}
export {}
//# sourceMappingURL=useFileSelection.d.ts.map
