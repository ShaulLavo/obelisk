/**
 * ReactiveFileState
 *
 * A thin accessor layer over the existing FsState signals.
 * Provides a path-specific view into the shared state stores.
 *
 * This does NOT create new signals - it derives from the existing
 * state in createFsState, avoiding duplicate reactive primitives.
 *
 * ## Usage
 * ```typescript
 * const fileState = fileCache.getFileState(path)
 *
 * // Read content (derives from state.pieceTables, state.fileStats)
 * const content = fileState.content()
 * const stats = fileState.stats()
 *
 * // Read syntax (derives from state.fileHighlights, etc.)
 * const highlights = fileState.highlights()
 *
 * // Read/write view state (derives from state.scrollPositions, etc.)
 * const scroll = fileState.scrollPosition()
 * fileState.setScrollPosition({ scrollTop: 100, ... })
 *
 * // Push content updates (writes to existing state)
 * fileState.mutateContent({ content, pieceTable, stats, previewBytes })
 * fileState.mutateSyntax({ highlights, folds, brackets, errors })
 * ```
 */

import type { FilePath } from '@repo/fs'
import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type { VisibleContentSnapshot } from '@repo/code-editor'
import type { ViewMode } from '../types/ViewMode'
import type {
	ScrollPosition,
	CursorPosition,
	SelectionRange,
	SyntaxData,
} from './types'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'

/**
 * Content data for file updates.
 */
export interface FileContentData {
	readonly content: string
	readonly pieceTable: PieceTableSnapshot | null
	readonly stats: ParseResult | null
	readonly previewBytes: Uint8Array | null
}

// Re-export SyntaxData for convenience
export type { SyntaxData }

/**
 * State stores that ReactiveFileState reads from.
 * These are the reactive stores from createFsState.
 */
export interface ReactiveFileStateStores {
	readonly pieceTables: Record<FilePath, PieceTableSnapshot | undefined>
	readonly fileStats: Record<FilePath, ParseResult | undefined>
	readonly fileHighlights: Record<FilePath, TreeSitterCapture[] | undefined>
	readonly fileFolds: Record<FilePath, FoldRange[] | undefined>
	readonly fileBrackets: Record<FilePath, BracketInfo[] | undefined>
	readonly fileErrors: Record<FilePath, TreeSitterError[] | undefined>
	readonly scrollPositions: Record<FilePath, ScrollPosition | undefined>
	readonly cursorPositions: Record<FilePath, CursorPosition | undefined>
	readonly fileSelections: Record<FilePath, SelectionRange[] | undefined>
	readonly visibleContents: Record<FilePath, VisibleContentSnapshot | undefined>
	readonly fileViewModes: Record<FilePath, ViewMode | undefined>
	readonly dirtyPaths: Record<FilePath, boolean | undefined>
}

/**
 * Setters for updating state stores.
 */
export interface ReactiveFileStateSetters {
	setPieceTable: (path: FilePath, value: PieceTableSnapshot | undefined) => void
	setFileStats: (path: FilePath, value: ParseResult | undefined) => void
	setHighlights: (path: FilePath, value: TreeSitterCapture[] | undefined) => void
	setFolds: (path: FilePath, value: FoldRange[] | undefined) => void
	setBrackets: (path: FilePath, value: BracketInfo[] | undefined) => void
	setErrors: (path: FilePath, value: TreeSitterError[] | undefined) => void
	setScrollPosition: (path: FilePath, value: ScrollPosition | undefined) => void
	setCursorPosition: (path: FilePath, value: CursorPosition | undefined) => void
	setSelections: (path: FilePath, value: SelectionRange[] | undefined) => void
	setVisibleContent: (path: FilePath, value: VisibleContentSnapshot | undefined) => void
	setViewMode: (path: FilePath, value: ViewMode | undefined) => void
	setDirtyPath: (path: FilePath, value: boolean | undefined) => void
	setPreviewBytes?: (path: FilePath, value: Uint8Array | undefined) => void
}

/**
 * ReactiveFileState - path-specific accessor for file state.
 *
 * All accessors are reactive (they read from Solid.js stores).
 * No signals are created here - this is a pure accessor layer.
 */
export interface ReactiveFileState {
	/** The file path (identity) */
	readonly path: FilePath

	// === Content Accessors (read from shared state) ===

	/** Piece table snapshot */
	pieceTable: () => PieceTableSnapshot | undefined

	/** File stats/metadata */
	stats: () => ParseResult | undefined

	/** Preview bytes for binary files */
	previewBytes: () => Uint8Array | undefined

	// === Syntax Accessors (read from shared state) ===

	/** Syntax highlights */
	highlights: () => TreeSitterCapture[] | undefined

	/** Code folds */
	folds: () => FoldRange[] | undefined

	/** Bracket pairs */
	brackets: () => BracketInfo[] | undefined

	/** Syntax errors */
	errors: () => TreeSitterError[] | undefined

	// === View State Accessors (read from shared state) ===

	/** Scroll position */
	scrollPosition: () => ScrollPosition | undefined
	setScrollPosition: (value: ScrollPosition | undefined) => void

	/** Cursor position */
	cursorPosition: () => CursorPosition | undefined
	setCursorPosition: (value: CursorPosition | undefined) => void

	/** Selection ranges */
	selections: () => SelectionRange[] | undefined
	setSelections: (value: SelectionRange[] | undefined) => void

	/** Visible content snapshot */
	visibleContent: () => VisibleContentSnapshot | undefined
	setVisibleContent: (value: VisibleContentSnapshot | undefined) => void

	/** View mode (editor, hex, image, etc.) */
	viewMode: () => ViewMode | undefined
	setViewMode: (value: ViewMode | undefined) => void

	/** Whether file has unsaved changes */
	isDirty: () => boolean
	setIsDirty: (value: boolean) => void

	// === Mutation Methods ===

	/** Update content state (pieceTable, stats, previewBytes) */
	mutateContent: (data: FileContentData) => void

	/** Update syntax state (highlights, folds, brackets, errors) */
	mutateSyntax: (data: SyntaxData) => void
}

/**
 * Options for creating a ReactiveFileState.
 */
export interface CreateReactiveFileStateOptions {
	path: FilePath
	stores: ReactiveFileStateStores
	setters: ReactiveFileStateSetters
	/** For preview bytes which aren't in the main stores */
	getPreviewBytes?: () => Uint8Array | undefined
}

/**
 * Create a ReactiveFileState for a file path.
 *
 * This is a thin accessor layer - no reactive primitives are created.
 * All reactivity comes from the underlying stores.
 */
export function createReactiveFileState(
	options: CreateReactiveFileStateOptions
): ReactiveFileState {
	const { path, stores, setters, getPreviewBytes } = options

	return {
		path,

		// Content accessors
		pieceTable: () => stores.pieceTables[path],
		stats: () => stores.fileStats[path],
		previewBytes: () => getPreviewBytes?.() ?? undefined,

		// Syntax accessors
		highlights: () => stores.fileHighlights[path],
		folds: () => stores.fileFolds[path],
		brackets: () => stores.fileBrackets[path],
		errors: () => stores.fileErrors[path],

		// View state accessors
		scrollPosition: () => stores.scrollPositions[path],
		setScrollPosition: (value) => setters.setScrollPosition(path, value),

		cursorPosition: () => stores.cursorPositions[path],
		setCursorPosition: (value) => setters.setCursorPosition(path, value),

		selections: () => stores.fileSelections[path],
		setSelections: (value) => setters.setSelections(path, value),

		visibleContent: () => stores.visibleContents[path],
		setVisibleContent: (value) => setters.setVisibleContent(path, value),

		viewMode: () => stores.fileViewModes[path],
		setViewMode: (value) => setters.setViewMode(path, value),

		isDirty: () => stores.dirtyPaths[path] ?? false,
		setIsDirty: (value) => setters.setDirtyPath(path, value),

		// Mutation methods
		mutateContent: (data) => {
			if (data.pieceTable !== null) {
				setters.setPieceTable(path, data.pieceTable)
			}
			if (data.stats !== null) {
				setters.setFileStats(path, data.stats)
			}
			if (data.previewBytes !== null) {
				setters.setPreviewBytes?.(path, data.previewBytes)
			}
		},

		mutateSyntax: (data) => {
			setters.setHighlights(path, data.highlights)
			setters.setFolds(path, data.folds)
			setters.setBrackets(path, data.brackets)
			setters.setErrors(path, data.errors)
		},
	}
}

// === Utility functions for accessing file state ===

export function getFileContent(state: ReactiveFileState): string {
	// Content is derived from pieceTable in the actual implementation
	return ''
}

export function getFilePieceTable(state: ReactiveFileState): PieceTableSnapshot | null {
	return state.pieceTable() ?? null
}

export function getFileStats(state: ReactiveFileState): ParseResult | null {
	return state.stats() ?? null
}

export function getFileHighlights(state: ReactiveFileState): TreeSitterCapture[] {
	return state.highlights() ?? []
}

export function getFileFolds(state: ReactiveFileState): FoldRange[] {
	return state.folds() ?? []
}

export function getFileBrackets(state: ReactiveFileState): BracketInfo[] {
	return state.brackets() ?? []
}

export function getFileErrors(state: ReactiveFileState): TreeSitterError[] {
	return state.errors() ?? []
}

// Backwards compatibility aliases
/** @deprecated Use ReactiveFileState instead */
export type UnifiedFileState = ReactiveFileState
/** @deprecated Use createReactiveFileState instead */
export const createUnifiedFileState = createReactiveFileState
/** @deprecated Use CreateReactiveFileStateOptions instead */
export type CreateUnifiedFileStateOptions = CreateReactiveFileStateOptions
/** @deprecated Use SyntaxData instead */
export type FileSyntaxData = SyntaxData
