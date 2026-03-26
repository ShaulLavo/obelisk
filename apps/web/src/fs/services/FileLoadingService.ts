/**
 * FileLoadingService
 *
 * Single source of truth for loading file content and metadata.
 * Consolidates logic previously split between useFileSelection and SplitEditorPanel.
 *
 * Responsibilities:
 * - Read file content from disk
 * - Detect binary/text content
 * - Parse with tree-sitter for syntax highlighting
 * - Cache results to IndexedDB
 *
 * Does NOT handle:
 * - UI state updates (caller's responsibility)
 * - View state (scroll, cursor, etc.)
 * - Tab management
 */

import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import {
	detectBinaryFromPreview,
	parseFileBuffer,
	createPieceTableSnapshot,
	createMinimalBinaryParseResult,
	getPieceTableText,
} from '@repo/utils'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'
import { parseBufferWithTreeSitter } from '../../treeSitter/workerClient'
import {
	getFileSize,
	readFilePreviewBytes,
	readFileBuffer,
} from '../runtime/streaming'
import type { FsSource } from '../types'
import type { DocumentCache } from '../cache/documentCache'

const textDecoder = new TextDecoder()

const toSyntaxResult = (result: { captures: TreeSitterCapture[]; folds: FoldRange[]; brackets: BracketInfo[]; errors: TreeSitterError[] }): SyntaxResult => ({
	highlights: result.captures,
	folds: result.folds,
	brackets: result.brackets,
	errors: result.errors,
})

/**
 * Result of loading a file's content.
 */
export interface FileLoadResult {
	/** File size in bytes */
	fileSize: number
	/** Text content (UTF-8 decoded) */
	content: string
	/** Piece table for editing */
	pieceTable: PieceTableSnapshot | null
	/** File stats (line count, etc.) */
	stats: ParseResult | null
	/** Preview bytes for binary files */
	previewBytes: Uint8Array | null
	/** Whether file is binary */
	isBinary: boolean
	/** Whether content came from cache */
	fromCache: boolean
}

/**
 * Result of syntax highlighting.
 */
export interface SyntaxResult {
	highlights: TreeSitterCapture[]
	folds: FoldRange[]
	brackets: BracketInfo[]
	errors: TreeSitterError[]
}

/**
 * Options for loading a file.
 */
export interface LoadFileOptions {
	/** File system source */
	source: FsSource
	/** File path */
	path: string
	/** File cache controller */
	fileCache: DocumentCache
	/** Skip cache lookup (force reload from disk) */
	forceReload?: boolean
	/** Callback when syntax highlighting completes (async) */
	onSyntaxReady?: (syntax: SyntaxResult) => void
}

/**
 * Load a file's content and metadata.
 *
 * This is the single entry point for all file loading operations.
 * Handles caching, binary detection, and piece table creation.
 *
 * Tree-sitter parsing happens asynchronously - results are delivered
 * via the onSyntaxReady callback.
 */
export async function loadFile(options: LoadFileOptions): Promise<FileLoadResult> {
	const { source, path, fileCache, forceReload, onSyntaxReady } = options

	const fileSize = await getFileSize(source, path)
	const previewBytes = await readFilePreviewBytes(source, path)
	let cachedEntry = forceReload ? {} : await fileCache.getAsync(path)

	const detection = detectBinaryFromPreview(path, previewBytes)
	const isBinary = !detection.isText

	if (cachedEntry.pieceTable && !forceReload) {
		const { pieceTable, stats } = cachedEntry
		const content = pieceTable ? getPieceTableText(pieceTable) : ''

		if (cachedEntry.highlights && onSyntaxReady) {
			onSyntaxReady({
				highlights: cachedEntry.highlights,
				folds: cachedEntry.folds ?? [],
				brackets: cachedEntry.brackets ?? [],
				errors: cachedEntry.errors ?? [],
			})
		} else if (onSyntaxReady && !isBinary) {
			// No cached highlights - parse in background
			const encoder = new TextEncoder()
			parseBufferWithTreeSitter(path, encoder.encode(content).buffer)
				.then((result) => {
					if (result) {
						const syntax = toSyntaxResult(result)
						fileCache.set(path, syntax)
						onSyntaxReady(syntax)
					}
				})
				.catch((e) => {
					// Expected for unsupported languages — tree-sitter may not have a parser
					console.debug('tree-sitter parse skipped (cached path):', path, e)
				})
		}

		return {
			fileSize,
			content,
			pieceTable: pieceTable ?? null,
			stats: stats ?? null,
			previewBytes: isBinary ? previewBytes : null,
			isBinary,
			fromCache: true,
		}
	}

	const buffer = await readFileBuffer(source, path)
	const textBytes = new Uint8Array(buffer)
	const content = textDecoder.decode(textBytes)

	let pieceTable: PieceTableSnapshot | null = null
	let stats: ParseResult | null = null

	if (isBinary) {
		// Binary file - create minimal stats
		stats = createMinimalBinaryParseResult(content, detection)
	} else {
		// Text file - create piece table and full stats
		stats = parseFileBuffer(content, { path, textHeuristic: detection })
		if (stats.contentKind === 'text') {
			pieceTable = createPieceTableSnapshot(content)
		}

		// Parse with tree-sitter asynchronously
		if (onSyntaxReady) {
			parseBufferWithTreeSitter(path, buffer)
				.then((result) => {
					if (result) {
						const syntax = toSyntaxResult(result)
						fileCache.set(path, syntax)
						onSyntaxReady(syntax)
					}
				})
				.catch((e) => {
					// Expected for unsupported languages — tree-sitter may not have a parser
					console.debug('tree-sitter parse skipped:', path, e)
				})
		}
	}

	// Cache content results
	fileCache.set(path, {
		pieceTable: pieceTable ?? undefined,
		stats: stats ?? undefined,
		previewBytes: isBinary ? previewBytes : undefined,
	})

	return {
		fileSize,
		content,
		pieceTable,
		stats,
		previewBytes: isBinary ? previewBytes : null,
		isBinary,
		fromCache: false,
	}
}

/**
 * Load only syntax highlighting for a file (no content loading).
 * Useful when content is already loaded but syntax isn't cached.
 */
export async function loadSyntax(
	path: string,
	content: string,
	fileCache: DocumentCache,
	onSyntaxReady: (syntax: SyntaxResult) => void
): Promise<void> {
	// Check cache first
	const cached = await fileCache.getAsync(path)
	if (cached.highlights) {
		onSyntaxReady({
			highlights: cached.highlights,
			folds: cached.folds ?? [],
			brackets: cached.brackets ?? [],
			errors: cached.errors ?? [],
		})
		return
	}

	// Parse with tree-sitter
	const encoder = new TextEncoder()
	const buffer = encoder.encode(content).buffer
	const parsePromise = parseBufferWithTreeSitter(path, buffer)

	if (parsePromise) {
		parsePromise
			.then((result) => {
				if (result) {
					const syntax = toSyntaxResult(result)
					fileCache.set(path, syntax)
					onSyntaxReady(syntax)
				}
			})
			.catch((e) => {
				// Expected for unsupported languages — tree-sitter may not have a parser
				console.debug('tree-sitter parse skipped (loadSyntax):', path, e)
			})
	}
}
