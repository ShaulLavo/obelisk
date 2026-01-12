/**
 * Resource Manager - Manages shared resources (buffers, highlights) across tabs.
 */

import { batch, createSignal, type Accessor } from 'solid-js'
import type { TabId } from './types'
import type {
	TreeSitterCapture,
	TreeSitterParseResult,
	BracketInfo,
	FoldRange,
	TreeSitterError,
} from '../workers/treeSitter/types'
import {
	ensureTreeSitterWorkerReady,
	parseBufferWithTreeSitter,
	applyTreeSitterEdit,
} from '../treeSitter/workerClient'
import type { TreeSitterEditPayload } from '../workers/treeSitter/types'
import {
	createFileLoadingState,
	type FileLoadingState,
	type FileLoadingError,
} from './fileLoadingErrors'

export interface TextEdit {
	startIndex: number
	oldEndIndex: number
	newEndIndex: number
	startPosition: { row: number; column: number }
	oldEndPosition: { row: number; column: number }
	newEndPosition: { row: number; column: number }
	insertedText: string
}

export interface HighlightState {
	captures: Accessor<TreeSitterCapture[]>
	brackets: Accessor<BracketInfo[]>
	folds: Accessor<FoldRange[]>
	errors: Accessor<TreeSitterError[]>
	setCaptures: (captures: TreeSitterCapture[]) => void
	setBrackets: (brackets: BracketInfo[]) => void
	setFolds: (folds: FoldRange[]) => void
	setErrors: (errors: TreeSitterError[]) => void
	updateFromParseResult: (result: TreeSitterParseResult) => void
}

export interface SharedBuffer {
	filePath: string
	content: Accessor<string>
	/** Increments on external content replacement (not incremental edits) */
	contentVersion: Accessor<number>
	setContent: (content: string) => void
	applyEdit: (edit: TextEdit) => Promise<void>
	onEdit: (callback: (edit: TextEdit) => void) => () => void
}

interface FileResource {
	tabIds: Set<TabId>
	buffer: SharedBuffer
	highlights: HighlightState
	workerReady: boolean
	loadingState: FileLoadingState
	lineStarts?: number[]
}

function buildLineStartsFromText(text: string): number[] {
	const starts: number[] = [0]
	let index = text.indexOf('\n')
	while (index !== -1) {
		starts.push(index + 1)
		index = text.indexOf('\n', index + 1)
	}
	return starts
}

export interface CachedHighlightData {
	captures?: TreeSitterCapture[]
	brackets?: BracketInfo[]
	folds?: FoldRange[]
	errors?: TreeSitterError[]
}

export interface ResourceManager {
	getBuffer: (filePath: string) => SharedBuffer | undefined
	getHighlightState: (filePath: string) => HighlightState | undefined
	getLoadingState: (filePath: string) => FileLoadingState | undefined
	getLineStarts: (filePath: string) => number[] | undefined
	registerTabForFile: (tabId: TabId, filePath: string) => void
	unregisterTabFromFile: (tabId: TabId, filePath: string) => void
	hasResourcesForFile: (filePath: string) => boolean
	getTabCountForFile: (filePath: string) => number
	getTrackedFiles: () => string[]
	cleanup: () => void
	preloadFileContent: (filePath: string, content: string) => void
	hydrateCachedHighlights: (filePath: string, data: CachedHighlightData) => void
	setFileError: (filePath: string, error: FileLoadingError | null) => void
	setFileLoadingStatus: (
		filePath: string,
		status: 'idle' | 'loading' | 'loaded' | 'error'
	) => void
	setFileMetadata: (
		filePath: string,
		metadata: { size?: number; isBinary?: boolean }
	) => void
	cleanupFileResources: (filePath: string) => void
}

function applyTextEdit(content: string, edit: TextEdit): string {
	const before = content.slice(0, edit.startIndex)
	const after = content.slice(edit.oldEndIndex)
	return before + edit.insertedText + after
}

function getEndPosition(text: string): { row: number; column: number } {
	if (text.length === 0) return { row: 0, column: 0 }
	let row = 0
	let lastNewlineIndex = -1
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			row++
			lastNewlineIndex = i
		}
	}
	return { row, column: text.length - lastNewlineIndex - 1 }
}

function createSharedBuffer(
	filePath: string,
	onContentReplaced?: (newContent: string) => void
): SharedBuffer {
	const [content, setContentSignal] = createSignal('')
	const [contentVersion, setContentVersion] = createSignal(0)
	const listeners = new Set<(edit: TextEdit) => void>()

	return {
		filePath,
		content,
		contentVersion,

		setContent(newContent: string) {
			const previousContent = content()
			if (previousContent === newContent) return

			// Update lineStarts BEFORE signals so reactive reads get fresh data
			onContentReplaced?.(newContent)

			// Batch so content+version change atomically (prevents stale version reads)
			batch(() => {
				setContentSignal(newContent)
				setContentVersion((v) => v + 1)
			})

			// Tree-sitter re-parse
			const payload: TreeSitterEditPayload = {
				path: filePath,
				startIndex: 0,
				oldEndIndex: previousContent.length,
				newEndIndex: newContent.length,
				startPosition: { row: 0, column: 0 },
				oldEndPosition: getEndPosition(previousContent),
				newEndPosition: getEndPosition(newContent),
				insertedText: newContent,
			}
			applyTreeSitterEdit(payload).catch(() => {})
		},

		async applyEdit(edit: TextEdit) {
			const previousContent = content()
			const newContent = applyTextEdit(previousContent, edit)

			// Don't increment contentVersion - that's only for external replacements
			setContentSignal(newContent)

			listeners.forEach((cb) => {
				try {
					cb(edit)
				} catch {}
			})

			try {
				const payload: TreeSitterEditPayload = {
					path: filePath,
					startIndex: edit.startIndex,
					oldEndIndex: edit.oldEndIndex,
					newEndIndex: edit.newEndIndex,
					startPosition: edit.startPosition,
					oldEndPosition: edit.oldEndPosition,
					newEndPosition: edit.newEndPosition,
					insertedText: edit.insertedText,
				}
				await applyTreeSitterEdit(payload)
			} catch {}
		},

		onEdit(callback) {
			listeners.add(callback)
			return () => listeners.delete(callback)
		},
	}
}

function createHighlightStateForFile(): HighlightState {
	const [captures, setCaptures] = createSignal<TreeSitterCapture[]>([])
	const [brackets, setBrackets] = createSignal<BracketInfo[]>([])
	const [folds, setFolds] = createSignal<FoldRange[]>([])
	const [errors, setErrors] = createSignal<TreeSitterError[]>([])

	return {
		captures,
		brackets,
		folds,
		errors,
		setCaptures,
		setBrackets,
		setFolds,
		setErrors,
		updateFromParseResult(result: TreeSitterParseResult) {
			setCaptures(result.captures)
			setBrackets(result.brackets)
			setFolds(result.folds)
			setErrors(result.errors)
		},
	}
}

export type OnHighlightsUpdate = (
	filePath: string,
	data: {
		captures: TreeSitterCapture[]
		brackets: BracketInfo[]
		folds: FoldRange[]
		errors: TreeSitterError[]
	}
) => void

export interface ResourceManagerOptions {
	onHighlightsUpdate?: OnHighlightsUpdate
}

export function createResourceManager(
	options: ResourceManagerOptions = {}
): ResourceManager {
	const { onHighlightsUpdate } = options
	const resources = new Map<string, FileResource>()

	function getOrCreateResource(filePath: string): FileResource {
		let resource = resources.get(filePath)
		if (!resource) {
			resource = {
				tabIds: new Set(),
				buffer: null as unknown as SharedBuffer,
				highlights: createHighlightStateForFile(),
				workerReady: false,
				loadingState: createFileLoadingState(),
			}
			resources.set(filePath, resource)

			const capturedResource = resource
			resource.buffer = createSharedBuffer(filePath, (newContent: string) => {
				capturedResource.lineStarts = buildLineStartsFromText(newContent)
			})
		}
		return resource
	}

	async function initializeWorkerForFile(
		filePath: string,
		resource: FileResource
	): Promise<void> {
		if (resource.workerReady) return

		try {
			await ensureTreeSitterWorkerReady()
			resource.workerReady = true

			const content = resource.buffer.content()
			if (content.length > 0) {
				try {
					const encoder = new TextEncoder()
					const buffer = encoder.encode(content).buffer
					const parseResult = await parseBufferWithTreeSitter(filePath, buffer)
					if (parseResult) {
						resource.highlights.updateFromParseResult(parseResult)
						onHighlightsUpdate?.(filePath, parseResult)
					}
				} catch {}
			}
		} catch {}
	}

	function registerTabForFile(tabId: TabId, filePath: string): void {
		const resource = getOrCreateResource(filePath)
		resource.tabIds.add(tabId)
		void initializeWorkerForFile(filePath, resource)
	}

	function unregisterTabFromFile(tabId: TabId, filePath: string): void {
		const resource = resources.get(filePath)
		if (!resource) return
		resource.tabIds.delete(tabId)
		// Don't cleanup here - cleanup happens when tab is closed from layout
	}

	function getBuffer(filePath: string): SharedBuffer | undefined {
		return resources.get(filePath)?.buffer
	}

	function getHighlightState(filePath: string): HighlightState | undefined {
		return resources.get(filePath)?.highlights
	}

	function hasResourcesForFile(filePath: string): boolean {
		return resources.has(filePath)
	}

	function getTabCountForFile(filePath: string): number {
		return resources.get(filePath)?.tabIds.size ?? 0
	}

	function getTrackedFiles(): string[] {
		return Array.from(resources.keys())
	}

	function cleanup(): void {
		resources.clear()
	}

	function preloadFileContent(filePath: string, content: string): void {
		const resource = getOrCreateResource(filePath)
		resource.buffer.setContent(content)
		resource.loadingState.setStatus('loaded')
		resource.lineStarts = buildLineStartsFromText(content)
	}

	function getLoadingState(filePath: string): FileLoadingState | undefined {
		return resources.get(filePath)?.loadingState
	}

	function getLineStarts(filePath: string): number[] | undefined {
		return resources.get(filePath)?.lineStarts
	}

	function setFileError(
		filePath: string,
		error: FileLoadingError | null
	): void {
		const resource = resources.get(filePath)
		if (resource) {
			resource.loadingState.setError(error)
			if (error) resource.loadingState.setStatus('error')
		}
	}

	function setFileLoadingStatus(
		filePath: string,
		status: 'idle' | 'loading' | 'loaded' | 'error'
	): void {
		const resource = resources.get(filePath)
		if (resource) resource.loadingState.setStatus(status)
	}

	function setFileMetadata(
		filePath: string,
		metadata: { size?: number; isBinary?: boolean }
	): void {
		const resource = resources.get(filePath)
		if (resource) {
			if (metadata.size !== undefined) resource.loadingState.setFileSize(metadata.size)
			if (metadata.isBinary !== undefined) resource.loadingState.setIsBinary(metadata.isBinary)
		}
	}

	function cleanupFileResources(filePath: string): void {
		resources.delete(filePath)
	}

	function hydrateCachedHighlights(
		filePath: string,
		data: CachedHighlightData
	): void {
		const resource = resources.get(filePath)
		if (!resource) return

		const hasData =
			data.captures?.length ||
			data.brackets?.length ||
			data.folds?.length ||
			data.errors?.length
		if (!hasData) return

		if (data.captures) resource.highlights.setCaptures(data.captures)
		if (data.brackets) resource.highlights.setBrackets(data.brackets)
		if (data.folds) resource.highlights.setFolds(data.folds)
		if (data.errors) resource.highlights.setErrors(data.errors)
	}

	return {
		getBuffer,
		getHighlightState,
		getLoadingState,
		getLineStarts,
		registerTabForFile,
		unregisterTabFromFile,
		hasResourcesForFile,
		getTabCountForFile,
		getTrackedFiles,
		cleanup,
		preloadFileContent,
		hydrateCachedHighlights,
		setFileError,
		setFileLoadingStatus,
		setFileMetadata,
		cleanupFileResources,
	}
}

export type { TreeSitterCapture, BracketInfo, FoldRange, TreeSitterError }
