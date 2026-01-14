import { createContext, useContext } from 'solid-js'
import type { DirTreeNode } from '@repo/fs'
import type { PieceTableSnapshot } from '@repo/utils'
import type { DocumentCache } from '../cache/documentCache'
import type { FsState, FsSource } from '../types'
import type { FileLoadingError } from '../../split-editor/fileLoadingErrors'
import type { FileLoadingState, SyntaxData } from '../store/types'

export type SelectPathOptions = {
	forceReload?: boolean
}

export type FsActions = {
	refresh: (source?: FsSource) => Promise<void>
	setSource: (source: FsSource) => Promise<void>
	toggleDir: (path: string) => void
	selectPath: (path: string, options?: SelectPathOptions) => Promise<void>
	setSelectedPathOnly: (path: string | undefined) => void
	isSelectedPath: (path: string | undefined) => boolean
	createDir: (parentPath: string, name: string) => Promise<void>
	createFile: (parentPath: string, name: string, content?: string) => Promise<void>
	deleteNode: (path: string) => Promise<void>
	ensureDirPathLoaded: (path: string) => Promise<DirTreeNode | undefined>
	updatePieceTableForPath: (
		path: string,
		updater: (current: PieceTableSnapshot | undefined) => PieceTableSnapshot | undefined
	) => void
	fileCache: DocumentCache
	saveFile: (path: string) => Promise<void>
	setDirty: (path: string, isDirty: boolean) => void
	setSavedContent: (path: string, content: string) => void
	setPieceTableContent: (path: string, content: string) => void
	pickNewRoot: () => Promise<void>
	collapseAll: () => void
	setCreationState: (state: { type: 'file' | 'folder'; parentPath: string } | null) => void
	setLoadingState: (path: string, state: FileLoadingState) => void
	setLoadingError: (path: string, error: FileLoadingError | null) => void
	setLineStarts: (path: string, lineStarts: number[]) => void
	preloadFileContent: (path: string, content: string) => void
	clearFileState: (path: string) => void
	setSyntax: (path: string, syntax: SyntaxData | null) => void
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
