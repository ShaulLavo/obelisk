import { createContext, useContext } from 'solid-js'
import type { FsState, FsSource } from '../types'

export type FsActions = {
	refresh: (source?: FsSource) => Promise<void>
	setSource: (source: FsSource) => Promise<void>
	toggleDir: (path: string) => void
	selectPath: (path: string) => Promise<void>
	createDir: (parentPath: string, name: string) => Promise<void>
	createFile: (parentPath: string, name: string, content?: string) => Promise<void>
	deleteNode: (path: string) => Promise<void>
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
