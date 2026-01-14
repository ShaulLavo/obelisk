import { batch } from 'solid-js'
import type { FsDirTreeNode } from '@repo/fs'
import type { SetStoreFunction } from 'solid-js/store'
import {
	ensureFs,
	buildTree,
	LocalDirectoryFallbackSwitchError,
} from '../runtime/fsRuntime'
import { DEFAULT_SOURCE } from '../config/constants'
import type { FsState, FsSource } from '../types'
import type { TreePrefetchClient } from '../prefetch/treePrefetchClient'
import { modal } from '@repo/ui/modal'

/**
 * Merges the OPFS .system folder into the main tree.
 * The .system folder always comes from OPFS regardless of active source.
 */
const mergeSystemFolder = (
	mainTree: FsDirTreeNode,
	systemTree: FsDirTreeNode | undefined
): FsDirTreeNode => {
	if (!systemTree) return mainTree

	// Find .system in the OPFS tree
	const systemNode = systemTree.children?.find((c) => c.name === '.system')
	if (!systemNode || systemNode.kind !== 'dir') return mainTree

	// Check if main tree already has .system
	const existingSystemIndex = mainTree.children?.findIndex(
		(c) => c.name === '.system'
	)

	// Clone the main tree's children array
	const newChildren = mainTree.children ? [...mainTree.children] : []

	if (existingSystemIndex !== undefined && existingSystemIndex >= 0) {
		// Replace existing .system with OPFS version
		newChildren[existingSystemIndex] = systemNode
	} else {
		// Add .system from OPFS
		newChildren.unshift(systemNode)
	}

	return {
		...mainTree,
		children: newChildren,
	}
}

type UseFsRefreshOptions = {
	state: FsState
	setTreeRoot: (root: FsDirTreeNode | undefined) => void
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setActiveSource: (source: FsSource) => void
	setLoading: (value: boolean) => void
	clearAllFileState: () => void
	clearSyntax: () => void
	clearDeferredMetadata: () => void
	setBackgroundPrefetching: (value: boolean) => void
	setBackgroundIndexedFileCount: (value: number) => void
	setLastPrefetchedPath: (path: string | undefined) => void
	ensureDirLoaded: (path: string) => Promise<void> | undefined
	buildEnsurePaths: () => string[]
	treePrefetchClient: TreePrefetchClient
	runPrefetchTask: (
		task: Promise<void> | undefined,
		fallbackMessage: string
	) => void
	selectPath: (
		path: string,
		options?: { forceReload?: boolean }
	) => Promise<void>
}

export const useFsRefresh = ({
	state,
	setTreeRoot,
	setExpanded,
	setActiveSource,
	setLoading,
	clearAllFileState,
	clearSyntax,
	clearDeferredMetadata,
	setBackgroundPrefetching,
	setBackgroundIndexedFileCount,
	setLastPrefetchedPath,
	ensureDirLoaded,
	buildEnsurePaths,
	treePrefetchClient,
	runPrefetchTask,
	selectPath,
}: UseFsRefreshOptions) => {
	let loadErrorModalId: string | null = null

	const clearLoadError = () => {
		if (!loadErrorModalId) return
		modal.dismiss(loadErrorModalId)
		loadErrorModalId = null
	}

	const showLoadError = (message: string, source: FsSource) => {
		const actions = [
			{
				id: 'retry',
				label: 'Retry',
				variant: 'default' as const,
				autoClose: false,
				onPress: () => {
					void refresh(source)
				},
			},
		]
		if (loadErrorModalId) {
			modal.update(loadErrorModalId, { body: message, actions })
			return
		}
		loadErrorModalId = modal({
			heading: 'Filesystem error',
			body: message,
			dismissable: false,
			actions,
		})
	}

	const getRestorableFilePath = () => {
		// File path is persisted to localStorage when a file is selected (see FsProvider createEffect)
		// so we can trust it's a file path even if it's not in the tree yet
		const lastFilePath =
			localStorage.getItem('fs-last-known-file-path') ?? undefined

		// If settings is open via URL, don't restore the last file path
		// The settings route effect will handle opening settings
		const urlParams = new URLSearchParams(window.location.search)
		if (urlParams.has('settings')) {
			return undefined
		}

		// If we have a stored file path from localStorage, use it directly
		// The file might not be in the tree yet (parent dir not loaded), but selectPath can handle that
		if (lastFilePath) {
			return lastFilePath
		}

		return undefined
	}

	const refresh = async (
		initialSource: FsSource = state.activeSource ?? DEFAULT_SOURCE
	) => {
		let source = initialSource
		for (;;) {
			batch(() => {
				setLoading(true)
				clearAllFileState()
				clearSyntax()
				clearDeferredMetadata()
			})
			const ensurePaths = buildEnsurePaths()

			try {
				const fsCtx = await ensureFs(source)

				// Always ensure .system is expanded (it contains settings files)
				const expandedPaths = {
					...state.expanded,
					'.system': true,
				}

				let built = await buildTree(source, {
					expandedPaths,
					ensurePaths: [...ensurePaths, '.system'],
				})

				// Always merge .system folder from OPFS (regardless of active source)
				if (source !== 'opfs') {
					try {
						const opfsTree = await buildTree('opfs', {
							expandedPaths: { '.system': true },
							ensurePaths: ['.system'],
						})
						built = mergeSystemFolder(built, opfsTree)
					} catch {
						// OPFS .system merge is best-effort, don't fail the whole refresh
					}
				}

				const restorablePath = getRestorableFilePath()

				batch(() => {
					setTreeRoot(built)
					setActiveSource(source)
					setExpanded((expanded) => ({
						...expanded,
						[built.path]: expanded[built.path] ?? true,
					}))
				})
				clearLoadError()

				await treePrefetchClient.init({
					source,
					rootHandle: fsCtx.root,
					rootPath: built.path ?? '',
					rootName: built.name || 'root',
				})

				// Get root children names for cache fingerprint
				const rootChildrenNames = (built.children ?? []).map((c) => c.name)

				// Try to restore from cache - restores loadedDirPaths so we don't re-prefetch them
				const cacheRestored =
					await treePrefetchClient.tryRestoreFromCache(rootChildrenNames)

				if (!cacheRestored) {
					// Set fingerprint for future cache saves
					treePrefetchClient.setShapeFingerprint(rootChildrenNames)
				}

				// Always seed the tree - if cache was restored, already-loaded dirs will be skipped
				runPrefetchTask(
					treePrefetchClient.seedTree(built),
					'Failed to seed prefetch worker'
				)

				for (const [expandedPath, isOpen] of Object.entries(state.expanded)) {
					if (isOpen) {
						void ensureDirLoaded(expandedPath)
					}
				}

				if (restorablePath) {
					await selectPath(restorablePath, { forceReload: true })
				}
				return
			} catch (error) {
				if (error instanceof LocalDirectoryFallbackSwitchError) {
					source = error.nextSource
					continue
				}
				batch(() => {
					setBackgroundPrefetching(false)
					setBackgroundIndexedFileCount(0)
					setLastPrefetchedPath(undefined)
				})
				showLoadError(
					error instanceof Error ? error.message : 'Failed to load filesystem',
					source
				)
				return
			} finally {
				setLoading(false)
			}
		}
	}

	return {
		refresh,
	}
}
