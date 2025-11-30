import { batch, type JSX, onMount } from 'solid-js'
import { webLogger } from '~/logger'
import { parseFileBuffer } from '~/utils/parse'
import { createPieceTableSnapshot } from '~/utils/pieceTable'
import { DEFAULT_SOURCE } from '../config/constants'
import { createFsMutations } from '../fsMutations'
import { collectFileHandles } from '../runtime/fileHandles'
import { buildTree, fileHandleCache, primeFsCache } from '../runtime/fsRuntime'
import {
	getFileSize,
	readFilePreviewBytes,
	readFileText
} from '../runtime/streaming'
import { findNode } from '../runtime/tree'
import { createFsState } from '../state/fsState'
import type { FsSource } from '../types'
import { FsContext, type FsContextValue } from './FsContext'

type TimingEntry = { label: string; duration: number }

export function FsProvider(props: { children: JSX.Element }) {
	const {
		state,
		hydration,
		setTree,
		setExpanded,
		setSelectedPath,
		setActiveSource,
		setSelectedFileSize,
		setSelectedFileContent,
		setError,
		setLoading,
		setFileStats,
		clearParseResults,
		setPieceTable,
		clearPieceTables
	} = createFsState()

	let selectRequestId = 0
	const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 100 // 100 MB

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
		setLoading(true)
		clearParseResults()
		clearPieceTables()

		try {
			const built = await buildTree(source)

			batch(() => {
				setTree(built)
				setActiveSource(source)
				setExpanded(expanded => ({
					...expanded,
					[built.path]: expanded[built.path] ?? true
				}))
				setError(undefined)
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
		const timings: TimingEntry[] = []
		const recordTiming = (label: string, duration: number) => {
			timings.push({ label, duration })
		}
		const formatBreakdownTable = () => {
			if (timings.length === 0) return ''
			const labelHeader = 'step'
			const durationHeader = 'duration'
			const labelWidth = Math.max(
				labelHeader.length,
				...timings.map(entry => entry.label.length)
			)
			const formatDuration = (value: number) => `${value.toFixed(2)}ms`
			const durationWidth = Math.max(
				durationHeader.length,
				...timings.map(entry => formatDuration(entry.duration).length)
			)
			const divider = `+-${'-'.repeat(labelWidth)}-+-${'-'.repeat(durationWidth)}-+`
			const header = `| ${labelHeader.padEnd(labelWidth)} | ${durationHeader.padEnd(durationWidth)} |`
			const rows = timings.map(
				entry =>
					`| ${entry.label.padEnd(labelWidth)} | ${formatDuration(entry.duration).padStart(durationWidth)} |`
			)
			const totalCaptured = timings.reduce(
				(sum, entry) => sum + entry.duration,
				0
			)
			const totalRow = `| ${'total'.padEnd(labelWidth)} | ${formatDuration(totalCaptured).padStart(durationWidth)} |`
			return [
				'timing breakdown:',
				divider,
				header,
				divider,
				...rows,
				divider,
				totalRow,
				divider
			].join('\n')
		}
		const logDuration = (status: string) => {
			const total = performance.now() - start
			const breakdownTable = formatBreakdownTable()
			const summary = `selectPath ${status} for ${path} in ${total.toFixed(2)}ms`
			webLogger.debug(
				breakdownTable ? `${summary}\n${breakdownTable}` : summary
			)
		}
		const timeSync = <T,>(label: string, fn: () => T): T => {
			const stepStart = performance.now()
			try {
				return fn()
			} finally {
				recordTiming(label, performance.now() - stepStart)
			}
		}
		const timeAsync = async <T,>(
			label: string,
			fn: () => Promise<T>
		): Promise<T> => {
			const stepStart = performance.now()
			try {
				return await fn()
			} finally {
				recordTiming(label, performance.now() - stepStart)
			}
		}

		const tree = state.tree
		if (!tree) {
			logDuration('skipped:no-tree')
			return
		}
		if (state.selectedPath === path) {
			logDuration('skipped:already-selected')
			return
		}

		const node = timeSync('find-node', () => findNode(tree, path))
		if (!node) {
			logDuration('skipped:not-found')
			return
		}

		if (node.kind === 'dir') {
			timeSync('select-dir', () => {
				setSelectedPath(path)
				setSelectedFileSize(undefined)
			})
			logDuration('selected-dir')
			return
		}

		const requestId = ++selectRequestId
		let completionStatus = 'complete'

		try {
			const source = state.activeSource ?? DEFAULT_SOURCE
			const fileSize = await timeAsync('get-file-size', () =>
				getFileSize(source, path)
			)
			if (requestId !== selectRequestId) {
				completionStatus = 'cancelled:stale-after-size'
				return
			}

			let selectedFileContentValue = ''
			let pieceTableSnapshot:
				| ReturnType<typeof createPieceTableSnapshot>
				| undefined
			let fileStatsResult: ReturnType<typeof parseFileBuffer> | undefined

			if (fileSize > MAX_FILE_SIZE_BYTES) {
				completionStatus = 'skipped:file-too-large'
			} else {
				const previewBytes = await timeAsync('read-preview-bytes', () =>
					readFilePreviewBytes(source, path)
				)
				if (requestId !== selectRequestId) {
					completionStatus = 'cancelled:stale-after-preview'
					return
				}

				const text = await timeAsync('read-file-text', () =>
					readFileText(source, path)
				)
				if (requestId !== selectRequestId) {
					completionStatus = 'cancelled:stale-after-read'
					return
				}

				selectedFileContentValue = text

				fileStatsResult = timeSync('parse-file-buffer', () =>
					parseFileBuffer(text, {
						path,
						previewBytes
					})
				)

				if (fileStatsResult.contentKind === 'text') {
					pieceTableSnapshot = timeSync('create-piece-table', () =>
						createPieceTableSnapshot(text)
					)
				}
			}

			batch(() => {
				timeSync('set-selected-path', () => setSelectedPath(path))
				timeSync('clear-error', () => setError(undefined))
				timeSync('set-selected-file-size', () => setSelectedFileSize(fileSize))
				timeSync('set-selected-file-content', () =>
					setSelectedFileContent(selectedFileContentValue)
				)
				if (pieceTableSnapshot) {
					timeSync('set-piece-table', () =>
						setPieceTable(path, pieceTableSnapshot)
					)
				}
				if (fileStatsResult) {
					timeSync('set-file-stats', () => setFileStats(path, fileStatsResult))
				}
			})
		} catch (error) {
			if (requestId !== selectRequestId) {
				completionStatus = 'cancelled:error-stale'
				return
			}
			completionStatus = 'error'
			handleReadError(error)
		} finally {
			logDuration(completionStatus)
		}
	}

	const { createDir, createFile, deleteNode } = createFsMutations({
		refresh,
		setExpanded,
		setSelectedPath,
		setSelectedFileSize,
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
