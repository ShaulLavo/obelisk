import { batch, type JSX, onMount } from 'solid-js'
import { createFsMutations } from '../fsMutations'
import { DEFAULT_SOURCE } from '../config/constants'
import { buildTree, fileHandleCache, primeFsCache } from '../runtime/fsRuntime'
import {
	cancelOtherStreams,
	streamFileText,
	resetStreamingState
} from '../runtime/streaming'
import { collectFileHandles } from '../runtime/fileHandles'
import { findNode } from '../runtime/tree'
import { createFsState } from '../state/fsState'
import type { FsSource } from '../types'
import { FsContext, type FsContextValue } from './FsContext'

export function FsProvider(props: { children: JSX.Element }) {
	const {
		state,
		hydration,
		setTree,
		setExpanded,
		setSelectedPath,
		setActiveSource,
		setSelectedFileContent,
		setError,
		setLoading
	} = createFsState()

	let selectRequestId = 0

	const restoreHandleCache = () => {
		if (!state.tree) return

		if (state.tree.kind === 'dir' && state.tree.handle) {
			primeFsCache(state.activeSource ?? DEFAULT_SOURCE, state.tree.handle)
		}

		fileHandleCache.clear()
		collectFileHandles(state.tree)
	}

	const refresh = async (
		source: FsSource = state.activeSource ?? DEFAULT_SOURCE
	) => {
		if (source !== state.activeSource) {
			resetStreamingState()
			setSelectedPath(undefined)
			setSelectedFileContent('')
			setExpanded({})
			setTree(undefined!)
		}

		setLoading(true)
		setError(undefined)
		try {
			const built = await buildTree(source)

			batch(() => {
				setTree(built)
				setActiveSource(source)
				setExpanded(expanded => ({
					...expanded,
					[built.path]: expanded[built.path] ?? true
				}))
			})
		} catch (error) {
			setError(
				error instanceof Error ? error.message : 'Failed to load filesystem'
			)
		} finally {
			setLoading(false)
		}
	}

	const toggleDir = (path: string) => {
		batch(() => {
			setExpanded(path, prev => !prev)
			setSelectedPath(path)
		})
	}

	const handleReadError = (error: unknown) => {
		if (error instanceof DOMException && error.name === 'AbortError') return

		setError(error instanceof Error ? error.message : 'Failed to read file')
	}

	const selectPath = async (path: string) => {
		const start = performance.now()
		const logDuration = (status: string) => {
			console.log(
				`[FsProvider] selectPath ${status} for ${path} in ${(performance.now() - start).toFixed(2)}ms`
			)
		}

		if (!state.tree) {
			logDuration('skipped:no-tree')
			return
		}

		const node = findNode(state.tree, path)
		if (!node) {
			logDuration('skipped:not-found')
			return
		}

		if (node.kind === 'dir') {
			setSelectedPath(path)
			logDuration('selected-dir')
			return
		}

		const requestId = ++selectRequestId

		cancelOtherStreams(path)

		try {
			setSelectedPath(path)
			setError(undefined)
			setSelectedFileContent('')

			const text = await streamFileText(
				state.activeSource ?? DEFAULT_SOURCE,
				path,
				text => {
					if (requestId !== selectRequestId) return
					setSelectedFileContent(text)
				}
			)

			if (requestId !== selectRequestId) return
			setSelectedFileContent(text)
		} catch (error) {
			if (requestId !== selectRequestId) return
			handleReadError(error)
		} finally {
			logDuration('complete')
		}
	}

	const { createDir, createFile, deleteNode } = createFsMutations({
		refresh,
		setExpanded,
		setSelectedPath,
		setSelectedFileContent,
		setError,
		getState: () => state,
		getActiveSource: () => state.activeSource
	})

	const setSource = (source: FsSource) => refresh(source)

	onMount(() => {
		void hydration.then(() => {
			restoreHandleCache()
			return refresh(state.activeSource ?? DEFAULT_SOURCE)
		})
	})

	const value: FsContextValue = [
		state,
		{
			refresh,
			setSource,
			toggleDir,
			selectPath,
			createDir,
			createFile,
			deleteNode
		}
	]

	return <FsContext.Provider value={value}>{props.children}</FsContext.Provider>
}
