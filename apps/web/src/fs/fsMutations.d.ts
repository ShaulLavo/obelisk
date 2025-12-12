import { type Setter } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import type { FsSource, FsState } from './types'
type FsMutationDeps = {
	refresh: (source?: FsSource) => Promise<void>
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setSelectedPath: Setter<string | undefined>
	setSelectedFileSize: Setter<number | undefined>
	setError: Setter<string | undefined>
	getState: () => FsState
	getActiveSource: () => FsSource
}
export declare const createFsMutations: ({
	getActiveSource,
	setExpanded,
	setSelectedPath,
	setSelectedFileSize,
	setError,
	getState,
	refresh,
}: FsMutationDeps) => {
	createDir: (parentPath: string, name: string) => Promise<void>
	createFile: (
		parentPath: string,
		name: string,
		content?: string
	) => Promise<void>
	deleteNode: (path: string) => Promise<void>
}
export {}
//# sourceMappingURL=fsMutations.d.ts.map
