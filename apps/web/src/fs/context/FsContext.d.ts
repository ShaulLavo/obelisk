import type { FsDirTreeNode } from '@repo/fs'
import type { PieceTableSnapshot } from '@repo/utils'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitterWorkerTypes'
import type { FileCacheController } from '../cache/fileCacheController'
import type { FsState, FsSource } from '../types'
export type SelectPathOptions = {
	forceReload?: boolean
}
export type FsActions = {
	refresh: (source?: FsSource) => Promise<void>
	setSource: (source: FsSource) => Promise<void>
	toggleDir: (path: string) => void
	selectPath: (path: string, options?: SelectPathOptions) => Promise<void>
	createDir: (parentPath: string, name: string) => Promise<void>
	createFile: (
		parentPath: string,
		name: string,
		content?: string
	) => Promise<void>
	deleteNode: (path: string) => Promise<void>
	ensureDirPathLoaded: (path: string) => Promise<FsDirTreeNode | undefined>
	updateSelectedFilePieceTable: (
		updater: (
			current: PieceTableSnapshot | undefined
		) => PieceTableSnapshot | undefined
	) => void
	updateSelectedFileHighlights: (
		highlights: TreeSitterCapture[] | undefined
	) => void
	updateSelectedFileFolds: (folds: FoldRange[] | undefined) => void
	updateSelectedFileBrackets: (brackets: BracketInfo[] | undefined) => void
	updateSelectedFileErrors: (errors: TreeSitterError[] | undefined) => void
	fileCache: FileCacheController
}
export type FsContextValue = [FsState, FsActions]
export declare const FsContext: import('solid-js').Context<
	FsContextValue | undefined
>
export declare function useFs(): FsContextValue
//# sourceMappingURL=FsContext.d.ts.map
