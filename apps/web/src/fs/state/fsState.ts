import { makePersisted } from '@solid-primitives/storage'
import localforage from 'localforage'
import { createSignal, mergeProps, type Setter } from 'solid-js'
import { createStore, type SetStoreFunction, unwrap } from 'solid-js/store'
import { DEFAULT_SOURCE } from '../config/constants'
import type { FsDirTreeNode } from '@repo/fs'
import type { FsState } from '../types'

export const createFsState = () => {
	const [tree, setTree, isTreeReady] = makePersisted(
		createStore<FsDirTreeNode>(undefined!),
		{
			name: 'fs-tree',
			storage: localforage,
			serialize: value => unwrap(value) as unknown as string,
			deserialize: value => value as unknown as FsDirTreeNode
		}
	)

	const [expanded, setExpanded] = makePersisted(
		createStore<Record<string, boolean>>({}),
		{
			name: 'fs-expanded'
		}
	)

	const [selectedPath, setSelectedPath] = makePersisted(
		createSignal<string | undefined>(undefined),
		{
			name: 'fs-selected-path'
		}
	)
	const [activeSource, setActiveSource] = makePersisted(
		createSignal(DEFAULT_SOURCE),
		{
			name: 'fs-active-source'
		}
	)
	// TODO persist selectedFileContent but make it performant (non blocking?)
	const [selectedFileContent, setSelectedFileContent] = createSignal<string>('')
	const [error, setError] = createSignal<string | undefined>(undefined)
	const [loading, setLoading] = createSignal(false)

	const hydration = Promise.allSettled([isTreeReady]).then(() => undefined)

	const state = {
		tree,
		expanded,
		get selectedPath() {
			return selectedPath()
		},
		get activeSource() {
			return activeSource()
		},
		get selectedFileContent() {
			return selectedFileContent()
		},
		get error() {
			return error()
		},
		get loading() {
			return loading()
		}
	} as FsState

	return {
		state,
		hydration,
		setTree,
		setExpanded,
		setSelectedPath,
		setActiveSource,
		setSelectedFileContent,
		setError,
		setLoading
	}
}
