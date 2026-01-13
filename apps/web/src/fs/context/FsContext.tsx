import { createContext, useContext } from 'solid-js'
import type { FsDirTreeNode } from '@repo/fs'
import type { PieceTableSnapshot } from '@repo/utils'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'
import type { FileCacheController } from '../cache/fileCacheController'
import type { FsState, FsSource } from '../types'
import type { ViewMode } from '../types/ViewMode'
import type {
	FileLoadingError,
	FileLoadingStatus,
} from '../../split-editor/fileLoadingErrors'

export type SelectPathOptions = {
	forceReload?: boolean
}

export type FsActions = {
	refresh: (source?: FsSource) => Promise<void>
	setSource: (source: FsSource) => Promise<void>
	toggleDir: (path: string) => void
	selectPath: (path: string, options?: SelectPathOptions) => Promise<void>
	/** Update tree selection without loading file content (for sync with layoutManager) */
	setSelectedPathOnly: (path: string | undefined) => void
	isSelectedPath: (path: string | undefined) => boolean
	createDir: (parentPath: string, name: string) => Promise<void>
	createFile: (
		parentPath: string,
		name: string,
		content?: string
	) => Promise<void>
	deleteNode: (path: string) => Promise<void>
	ensureDirPathLoaded: (path: string) => Promise<FsDirTreeNode | undefined>
	/** Update piece table for a specific file path (for split editor tabs) */
	updatePieceTableForPath: (
		path: string,
		updater: (
			current: PieceTableSnapshot | undefined
		) => PieceTableSnapshot | undefined
	) => void
	/** Update highlights for a specific file path (for split editor tabs) */
	updateHighlightsForPath: (
		path: string,
		highlights: TreeSitterCapture[] | undefined
	) => void
	/** Update folds for a specific file path */
	updateFoldsForPath: (path: string, folds: FoldRange[] | undefined) => void
	/** Update brackets for a specific file path */
	updateBracketsForPath: (path: string, brackets: BracketInfo[] | undefined) => void
	/** Update errors for a specific file path */
	updateErrorsForPath: (path: string, errors: TreeSitterError[] | undefined) => void
	setViewMode: (path: string, viewMode: ViewMode) => void
	fileCache: FileCacheController
	saveFile: (path: string) => Promise<void>
	setDirtyPath: (path: string, isDirty: boolean) => void
	/** Set saved content baseline for dirty tracking */
	setSavedContent: (path: string, content: string) => void
	/** Replace piece table content entirely (for external reload) */
	setPieceTableContent: (path: string, content: string) => void
	pickNewRoot: () => Promise<void>
	collapseAll: () => void
	setCreationState: (
		state: { type: 'file' | 'folder'; parentPath: string } | null
	) => void
	/** Set file loading status (for split editor) */
	setFileLoadingStatus: (path: string, status: FileLoadingStatus) => void
	/** Set file loading error (for split editor) */
	setFileLoadingError: (path: string, error: FileLoadingError | null) => void
	/** Set line starts for a file (for editor performance) */
	setFileLineStarts: (path: string, lineStarts: number[]) => void
	/** Preload file content - sets status to loaded and computes line starts */
	preloadFileContent: (path: string, content: string) => void
	/** Clear loading state for a file */
	clearFileLoadingState: (path: string) => void
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
