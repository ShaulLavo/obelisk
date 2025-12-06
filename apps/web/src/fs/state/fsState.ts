/* eslint-disable solid/reactivity */
import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'
import { makePersisted } from '@solid-primitives/storage'
import localforage from 'localforage'
import { createMemo, createSignal } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import { getPieceTableText } from '@repo/utils'
import { DEFAULT_SOURCE } from '../config/constants'
import { findNode } from '../runtime/tree'
import type { FsState } from '../types'
import {
	evictCacheEntries,
	removeCacheEntry,
	touchCacheEntry
} from '../../utils/cache'

const MAX_FILE_STATS_CACHE = 100

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
	const [selectedFileSize, setSelectedFileSize] = createSignal<
		number | undefined
	>(undefined)
	const [selectedFilePreviewBytes, setSelectedFilePreviewBytes] = createSignal<
		Uint8Array | undefined
	>(undefined)
	const [selectedFileContent, setSelectedFileContent] = createSignal('')
	const [selectedFileLoading, setSelectedFileLoading] = createSignal(false)
	const [error, setError] = createSignal<string | undefined>(undefined)
	const [loading, setLoading] = createSignal(false)
	const [fileStats, setFileStatsStore] = createStore<
		Record<string, ParseResult | undefined>
	>({})
	const [pieceTables, setPieceTablesStore] = createStore<
		Record<string, PieceTableSnapshot | undefined>
	>({})
	const fileStatsOrder: string[] = []
	const selectedNode = createMemo<FsTreeNode | undefined>(() =>
		tree ? findNode(tree, selectedPath()) : undefined
	)
	const lastKnownFileNode = createMemo<FsTreeNode | undefined>(prev => {
		const node = selectedNode()
		if (node?.kind === 'file') {
			return node
		}
		return prev
	})

	const lastKnownFilePath = () => lastKnownFileNode()?.path
	const hydration = Promise.allSettled([isTreeReady]).then(() => undefined)

	const evictFileStatsEntry = (path: string) => {
		setFileStatsStore(path, undefined)
	}

	const updateFileStats = (path: string, result?: ParseResult) => {
		if (!path) return
		if (!result) {
			removeCacheEntry(fileStatsOrder, path)
			evictFileStatsEntry(path)
			return
		}

		setFileStatsStore(path, result)
		touchCacheEntry(fileStatsOrder, path)
		evictCacheEntries(fileStatsOrder, MAX_FILE_STATS_CACHE, evictFileStatsEntry)
	}

	const clearParseResults = () => {
		fileStatsOrder.length = 0
		for (const path of Object.keys(fileStats)) {
			evictFileStatsEntry(path)
		}
	}

	const evictPieceTableEntry = (path: string) => {
		setPieceTablesStore(path, undefined)
	}

	const setPieceTable = (path: string, snapshot?: PieceTableSnapshot) => {
		if (!path) return
		if (!snapshot) {
			evictPieceTableEntry(path)
			return
		}

		setPieceTablesStore(path, snapshot)
	}

	const clearPieceTables = () => {
		for (const path of Object.keys(pieceTables)) {
			evictPieceTableEntry(path)
		}
	}

	const state = {
		tree,
		expanded,
		fileStats,
		pieceTables,
		get selectedPath() {
			return selectedPath()
		},
		get selectedFileLoading() {
			return selectedFileLoading()
		},
		get activeSource() {
			return activeSource()
		},
		get selectedFileContent() {
			const path = lastKnownFilePath()
			if (!path) {
				return selectedFileContent()
			}

			const snapshot = pieceTables[path]
			if (snapshot) {
				return getPieceTableText(snapshot)
			}

			return selectedFileContent()
		},
		get selectedFileSize() {
			return selectedFileSize()
		},
		get selectedFilePreviewBytes() {
			return selectedFilePreviewBytes()
		},
		get error() {
			return error()
		},
		get loading() {
			return loading()
		},
		get selectedFileStats() {
			const path = lastKnownFilePath()
			return path ? fileStats[path] : undefined
		},
		get selectedFilePieceTable() {
			const path = lastKnownFilePath()
			return path ? pieceTables[path] : undefined
		},
		get selectedNode() {
			return selectedNode()
		},
		get lastKnownFileNode() {
			return lastKnownFileNode()
		},
		get lastKnownFilePath() {
			return lastKnownFilePath()
		}
	} as FsState

	return {
		state,
		hydration,
		setTree,
		setExpanded,
		setSelectedPath,
		setActiveSource,
		setSelectedFileSize,
		setSelectedFilePreviewBytes,
		setSelectedFileContent,
		setSelectedFileLoading,
		setError,
		setLoading,
		setFileStats: updateFileStats,
		clearParseResults,
		setPieceTable,
		clearPieceTables
	}
}
