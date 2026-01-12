import { createContext, useContext } from 'solid-js'
import type { FsDirTreeNode } from '@repo/fs'
import type { PieceTableSnapshot } from '@repo/utils'
import type { VisibleContentSnapshot } from '@repo/code-editor'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'
import type {
	FileCacheController,
	ScrollPosition,
} from '../cache/fileCacheController'
import type { FsState, FsSource } from '../types'
import type { HighlightTransform } from '../store/types'
import type { ViewMode } from '../types/ViewMode'

export type SelectPathOptions = {
	forceReload?: boolean
}

export type FsActions = {
	refresh: (source?: FsSource) => Promise<void>
	setSource: (source: FsSource) => Promise<void>
	toggleDir: (path: string) => void
	selectPath: (path: string, options?: SelectPathOptions) => Promise<void>
	isSelectedPath: (path: string) => boolean
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
	applySelectedFileHighlightOffset: (transform: HighlightTransform) => void
	updateSelectedFileFolds: (folds: FoldRange[] | undefined) => void
	updateSelectedFileBrackets: (brackets: BracketInfo[] | undefined) => void
	updateSelectedFileErrors: (errors: TreeSitterError[] | undefined) => void
	updateSelectedFileScrollPosition: (
		scrollPosition: ScrollPosition | undefined
	) => void
	updateSelectedFileVisibleContent: (
		visibleContent: VisibleContentSnapshot | undefined
	) => void
	setViewMode: (path: string, viewMode: ViewMode) => void
	fileCache: FileCacheController
	saveFile: (path?: string) => Promise<void>
	setDirtyPath: (path: string, isDirty: boolean) => void
	pickNewRoot: () => Promise<void>
	collapseAll: () => void
	setCreationState: (
		state: { type: 'file' | 'folder'; parentPath: string } | null
	) => void
}

export type FsContextValue = [FsState, FsActions]

export const FsContext = createContext<FsContextValue>()

export function useFs(): FsContextValue {
	const ctx = useContext(FsContext)
	if (!ctx) {
		throw new Error('useFs must be used within an FsProvider')
	}
	return ctx
}
