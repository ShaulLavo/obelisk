import { expose } from 'comlink'
import { Parser, Language, Query, Tree } from 'web-tree-sitter'
import { getScopeColorId } from '@repo/code-editor/tokenSummary'
import type {
	TreeSitterWorkerApi,
	TreeSitterEditPayload,
	TreeSitterCapture,
	BracketInfo,
	TreeSitterParseResult,
	TreeSitterError,
	FoldRange,
	MinimapTokenSummary,
} from './treeSitterWorkerTypes'

import { logger } from '../logger'

import jsHighlightsQuerySource from '../treeSitter/queries/javascript-highlights.scm?raw'
import jsJsxHighlightsQuerySource from 'tree-sitter-javascript/queries/highlights-jsx.scm?raw'
import tsHighlightsQuerySource from '../treeSitter/queries/typescript-highlights.scm?raw'
import jsFoldsQuerySource from '../treeSitter/queries/javascript-folds.scm?raw'
import tsFoldsQuerySource from '../treeSitter/queries/typescript-folds.scm?raw'

const log = logger.withTag('treeSitter')
type CachedTreeEntry = {
	tree: Tree
	text: string
	captures?: TreeSitterCapture[]
	brackets?: BracketInfo[]
	folds?: FoldRange[]
}

let parserInstance: Parser | null = null
let parserInitPromise: Promise<void> | null = null
let languageInstance: Language | null = null
let highlightQueries: Query[] = []
let foldQueries: Query[] = []
const textDecoder = new TextDecoder()
const astCache = new Map<string, CachedTreeEntry>()

const locateWasm = () => '/tree-sitter/tree-sitter.wasm'
const tsxGrammarPath = '/tree-sitter/tree-sitter-tsx.wasm'

const ensureParser = async () => {
	if (!parserInitPromise) {
		parserInitPromise = (async () => {
			await Parser.init({ locateFile: locateWasm })
			const parser = new Parser()
			const tsLanguage = await Language.load(tsxGrammarPath)
			parser.setLanguage(tsLanguage)
			parserInstance = parser
			languageInstance = tsLanguage
			highlightQueries = []
			foldQueries = []
		})().catch((error) => {
			parserInitPromise = null
			log.error('Tree-sitter parser init failed', error)
			throw error
		})
	}

	await parserInitPromise
	return parserInstance
}

const applyTextEdit = (
	text: string,
	startIndex: number,
	oldEndIndex: number,
	insertedText: string
) => text.slice(0, startIndex) + insertedText + text.slice(oldEndIndex)

// Subscribers for minimap readiness notifications.
// Used by the minimap renderer worker to render as soon as the cache updates.
const minimapReadySubscribers = new Set<(payload: { path: string }) => void>()

const notifyMinimapReady = (path: string) => {
	for (const callback of minimapReadySubscribers) {
		try {
			callback({ path })
		} catch (error) {
			log.warn('[minimap] subscriber callback failed', error)
		}
	}
}

const setCachedEntry = (path: string, entry: CachedTreeEntry) => {
	const existing = astCache.get(path)
	if (existing && existing.tree !== entry.tree) {
		existing.tree.delete()
	}
	astCache.set(path, entry)
	notifyMinimapReady(path)
}

const highlightQuerySources = [
	tsHighlightsQuerySource,
	jsHighlightsQuerySource,
	jsJsxHighlightsQuerySource,
].filter(Boolean)

const foldQuerySources = [tsFoldsQuerySource, jsFoldsQuerySource].filter(
	Boolean
)

const ensureHighlightQueries = async () => {
	if (highlightQueries.length > 0) return highlightQueries
	const parser = await ensureParser()
	if (!parser) return []
	const language = languageInstance ?? parser.language
	if (!language) return []

	try {
		const source = highlightQuerySources.join('\n')
		highlightQueries = [new Query(language, source)]
	} catch (error) {
		log.error('[Tree-sitter worker] failed to init query', error)
		highlightQueries = []
	}
	return highlightQueries
}

const ensureFoldQueries = async () => {
	if (foldQueries.length > 0) return foldQueries
	const parser = await ensureParser()
	if (!parser) return []
	const language = languageInstance ?? parser.language
	if (!language) return []

	try {
		const source = foldQuerySources.join('\n')
		foldQueries = [new Query(language, source)]
	} catch (error) {
		log.error('[Tree-sitter worker] failed to init fold query', error)
		foldQueries = []
	}
	return foldQueries
}

// Bracket types we care about
const BRACKET_PAIRS: Record<string, string> = {
	'(': ')',
	'[': ']',
	'{': '}',
}

const OPEN_BRACKETS = new Set(Object.keys(BRACKET_PAIRS))
const CLOSE_BRACKETS = new Set(Object.values(BRACKET_PAIRS))

// Type alias for SyntaxNode (not directly exported from web-tree-sitter)
type SyntaxNode = ReturnType<Tree['rootNode']['child']>

const runHighlightQueries = async (
	tree: Tree | null
): Promise<TreeSitterCapture[] | undefined> => {
	if (!tree) return undefined
	const queries = await ensureHighlightQueries()
	if (!queries.length) return undefined
	const results: TreeSitterCapture[] = []
	const seen = new Set<string>()
	for (const query of queries) {
		for (const match of query.matches(tree.rootNode)) {
			for (const capture of match.captures) {
				const captureName = capture.name ?? ''
				const startIndex = capture.node.startIndex
				const endIndex = capture.node.endIndex
				const key = `${startIndex}:${endIndex}:${captureName}`
				if (seen.has(key)) continue
				seen.add(key)
				results.push({
					startIndex,
					endIndex,
					captureName,
				})
			}
		}
	}
	results.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex)
	return results
}

const runFoldQueries = async (
	tree: Tree | null
): Promise<FoldRange[] | undefined> => {
	if (!tree) return undefined
	const queries = await ensureFoldQueries()
	if (!queries.length) return undefined
	const results: FoldRange[] = []
	const seen = new Set<string>()

	for (const query of queries) {
		for (const match of query.matches(tree.rootNode)) {
			for (const capture of match.captures) {
				const node = capture.node
				const startLine = node.startPosition.row
				const endLine = node.endPosition.row
				if (endLine <= startLine) continue
				const key = `${startLine}:${endLine}:${node.type}`
				if (seen.has(key)) continue
				seen.add(key)
				results.push({
					startLine,
					endLine,
					type: node.type,
				})
			}
		}
	}

	results.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine)
	return results
}

type TreeWalkVisitors = {
	onBracket?: (info: BracketInfo) => void
	onError?: (info: TreeSitterError) => void
}

const walkTree = (
	node: SyntaxNode | null,
	visitors: TreeWalkVisitors,
	bracketStack: { char: string; index: number }[]
) => {
	if (!node) return

	const type = node.type

	if (OPEN_BRACKETS.has(type)) {
		bracketStack.push({ char: type, index: node.startIndex })
		visitors.onBracket?.({
			index: node.startIndex,
			char: type,
			depth: bracketStack.length,
		})
	} else if (CLOSE_BRACKETS.has(type)) {
		const depth = bracketStack.length > 0 ? bracketStack.length : 1
		visitors.onBracket?.({
			index: node.startIndex,
			char: type,
			depth,
		})
		const last = bracketStack[bracketStack.length - 1]
		if (last && BRACKET_PAIRS[last.char] === type) {
			bracketStack.pop()
		}
	}

	if (node.type === 'ERROR' || node.isMissing) {
		visitors.onError?.({
			startIndex: node.startIndex,
			endIndex: node.endIndex,
			isMissing: node.isMissing,
			message: node.type,
		})
	} else if (node.hasError) {
		for (let i = 0; i < node.childCount; i++) {
			walkTree(node.child(i)!, visitors, bracketStack)
		}
		return
	}

	for (let i = 0; i < node.childCount; i++) {
		walkTree(node.child(i)!, visitors, bracketStack)
	}
}

const collectTreeData = (tree: Tree) => {
	const brackets: BracketInfo[] = []
	const errors: TreeSitterError[] = []
	const bracketStack: { char: string; index: number }[] = []

	walkTree(
		tree.rootNode,
		{
			onBracket: (info) => brackets.push(info),
			onError: (info) => errors.push(info),
		},
		bracketStack
	)

	return { brackets, errors }
}

/**
 * Determines if an edit can be handled by shifting indices
 * rather than re-running tree-sitter queries.
 * Safe for pure insertions of whitespace/newlines.
 */
const isShiftableEdit = (
	insertedText: string,
	startIndex: number,
	oldEndIndex: number
): boolean => {
	const isInsertion = oldEndIndex === startIndex
	const isWhitespaceOnly = /^\s*$/.test(insertedText)
	const hasContent = insertedText.length > 0
	return isInsertion && isWhitespaceOnly && hasContent
}

const getEditCharDelta = (edit: {
	insertedText: string
	newEndIndex?: number
	oldEndIndex?: number
}): number => {
	if (
		typeof edit.newEndIndex === 'number' &&
		typeof edit.oldEndIndex === 'number'
	) {
		return edit.newEndIndex - edit.oldEndIndex
	}

	return edit.insertedText.length
}

const getEditLineDelta = (edit: {
	startPosition?: { row: number }
	oldEndPosition?: { row: number }
	newEndPosition?: { row: number }
}): number => {
	const startRow = edit.startPosition?.row
	const oldEndRow = edit.oldEndPosition?.row
	const newEndRow = edit.newEndPosition?.row

	const hasNewEndRow = typeof newEndRow === 'number'
	const hasOldEndRow = typeof oldEndRow === 'number'
	const hasStartRow = typeof startRow === 'number'

	if (hasNewEndRow && hasOldEndRow) return newEndRow - oldEndRow
	if (hasNewEndRow && hasStartRow) return newEndRow - startRow
	return 0
}

/**
 * Shifts capture indices after a text edit.
 */
const shiftCaptures = (
	captures: TreeSitterCapture[],
	insertPosition: number,
	delta: number
): TreeSitterCapture[] => {
	return captures.map((capture) => {
		const startsAfterInsert = capture.startIndex >= insertPosition
		const endsAfterInsert = capture.endIndex > insertPosition

		const newStartIndex = startsAfterInsert
			? capture.startIndex + delta
			: capture.startIndex
		const newEndIndex = endsAfterInsert
			? capture.endIndex + delta
			: capture.endIndex

		return {
			...capture,
			startIndex: newStartIndex,
			endIndex: newEndIndex,
		}
	})
}

/**
 * Shifts bracket indices after a text edit.
 */
const shiftBrackets = (
	brackets: BracketInfo[],
	insertPosition: number,
	delta: number
): BracketInfo[] => {
	return brackets.map((bracket) => {
		const isAfterInsert = bracket.index >= insertPosition
		const newIndex = isAfterInsert ? bracket.index + delta : bracket.index

		return {
			...bracket,
			index: newIndex,
		}
	})
}

/**
 * Shifts fold ranges after a line edit.
 */
const shiftFolds = (
	folds: FoldRange[],
	insertLineRow: number,
	lineDelta: number
): FoldRange[] => {
	return folds.map((fold) => {
		const startAfterInsert = fold.startLine >= insertLineRow
		const endAfterInsert = fold.endLine >= insertLineRow

		const newStartLine = startAfterInsert
			? fold.startLine + lineDelta
			: fold.startLine
		const newEndLine = endAfterInsert ? fold.endLine + lineDelta : fold.endLine

		return {
			...fold,
			startLine: newStartLine,
			endLine: newEndLine,
		}
	})
}

const processTree = async (tree: Tree): Promise<TreeSitterParseResult> => {
	const { brackets, errors } = collectTreeData(tree)
	const [captures, folds] = await Promise.all([
		runHighlightQueries(tree),
		runFoldQueries(tree),
	])
	return {
		captures: captures ?? [],
		folds: folds ?? [],
		brackets,
		errors,
	}
}

const parseAndCacheText = async (
	path: string,
	text: string
): Promise<TreeSitterParseResult | undefined> => {
	const parser = await ensureParser()
	if (!parser) return undefined
	const tree = parser.parse(text)
	if (!tree) return undefined
	const result = await processTree(tree)
	setCachedEntry(path, {
		tree,
		text,
		captures: result.captures,
		brackets: result.brackets,
		folds: result.folds,
	})
	return result
}

const reparseWithEdit = async (
	path: string,
	payload: TreeSitterEditPayload
): Promise<TreeSitterParseResult | undefined> => {
	const parser = await ensureParser()
	if (!parser) return undefined
	const cached = astCache.get(path)
	if (!cached) return undefined

	const updatedText = applyTextEdit(
		cached.text,
		payload.startIndex,
		payload.oldEndIndex,
		payload.insertedText
	)

	cached.tree.edit({
		startIndex: payload.startIndex,
		oldEndIndex: payload.oldEndIndex,
		newEndIndex: payload.newEndIndex,
		startPosition: payload.startPosition,
		oldEndPosition: payload.oldEndPosition,
		newEndPosition: payload.newEndPosition,
	})

	const nextTree = parser.parse(updatedText, cached.tree)
	if (!nextTree) return undefined

	// Check if edit is shiftable
	const hasCachedData = cached.captures && cached.brackets && cached.folds
	const editIsShiftable =
		hasCachedData &&
		isShiftableEdit(
			payload.insertedText,
			payload.startIndex,
			payload.oldEndIndex
		)

	if (editIsShiftable) {
		const charDelta = getEditCharDelta(payload)
		const lineDelta = getEditLineDelta(payload)

		const shiftedCaptures = shiftCaptures(
			cached.captures!,
			payload.startIndex,
			charDelta
		)
		const shiftedBrackets = shiftBrackets(
			cached.brackets!,
			payload.startIndex,
			charDelta
		)
		const shiftedFolds = shiftFolds(
			cached.folds!,
			payload.startPosition.row,
			lineDelta
		)

		const { errors } = collectTreeData(nextTree)

		const result: TreeSitterParseResult = {
			captures: shiftedCaptures,
			brackets: shiftedBrackets,
			folds: shiftedFolds,
			errors,
		}

		setCachedEntry(path, {
			tree: nextTree,
			text: updatedText,
			captures: shiftedCaptures,
			brackets: shiftedBrackets,
			folds: shiftedFolds,
		})

		return result
	}

	// Full reparse with queries
	const result = await processTree(nextTree)
	setCachedEntry(path, {
		tree: nextTree,
		text: updatedText,
		captures: result.captures,
		brackets: result.brackets,
		folds: result.folds,
	})
	return result
}

const reparseWithEditBatch = async (
	path: string,
	edits: Omit<TreeSitterEditPayload, 'path'>[]
): Promise<TreeSitterParseResult | undefined> => {
	if (edits.length === 0) return undefined
	const parser = await ensureParser()
	if (!parser) return undefined
	const cached = astCache.get(path)
	if (!cached) {
		log.warn('[reparseWithEditBatch] No cached entry for path:', path)
		return undefined
	}

	// Check if all edits are shiftable (whitespace-only insertions)
	const hasCachedData = cached?.captures && cached.brackets && cached.folds
	const allEditsShiftable =
		hasCachedData &&
		edits.every((edit) =>
			isShiftableEdit(edit.insertedText, edit.startIndex, edit.oldEndIndex)
		)

	let currentText = cached.text
	let currentTree = cached.tree

	// Apply each edit sequentially to both text and tree
	for (const edit of edits) {
		currentText = applyTextEdit(
			currentText,
			edit.startIndex,
			edit.oldEndIndex,
			edit.insertedText
		)

		currentTree.edit({
			startIndex: edit.startIndex,
			oldEndIndex: edit.oldEndIndex,
			newEndIndex: edit.newEndIndex,
			startPosition: edit.startPosition,
			oldEndPosition: edit.oldEndPosition,
			newEndPosition: edit.newEndPosition,
		})

		const nextTree = parser.parse(currentText, currentTree)
		if (!nextTree) return undefined

		// Clean up old tree if it's not the original cached one
		if (currentTree !== cached.tree) {
			currentTree.delete()
		}
		currentTree = nextTree
	}

	// If all edits were shiftable, use index shifting instead of re-querying
	if (allEditsShiftable) {
		let shiftedCaptures = cached.captures!
		let shiftedBrackets = cached.brackets!
		let shiftedFolds = cached.folds!

		let cumulativeCharDelta = 0
		let cumulativeLineDelta = 0

		for (const edit of edits) {
			const charDelta = getEditCharDelta(edit)
			const lineDelta = getEditLineDelta(edit)

			const adjustedIndex = edit.startIndex + cumulativeCharDelta
			const adjustedRow = edit.startPosition.row + cumulativeLineDelta

			shiftedCaptures = shiftCaptures(shiftedCaptures, adjustedIndex, charDelta)
			shiftedBrackets = shiftBrackets(shiftedBrackets, adjustedIndex, charDelta)
			shiftedFolds = shiftFolds(shiftedFolds, adjustedRow, lineDelta)

			cumulativeCharDelta += charDelta
			cumulativeLineDelta += lineDelta
		}

		// Walk tree for errors (still useful to update error locations)
		const { errors } = collectTreeData(currentTree)

		const result: TreeSitterParseResult = {
			captures: shiftedCaptures,
			brackets: shiftedBrackets,
			folds: shiftedFolds,
			errors,
		}

		setCachedEntry(path, {
			tree: currentTree,
			text: currentText,
			captures: shiftedCaptures,
			brackets: shiftedBrackets,
			folds: shiftedFolds,
		})

		return result
	}

	// Full reparse with queries
	const result = await processTree(currentTree)
	setCachedEntry(path, {
		tree: currentTree,
		text: currentText,
		captures: result.captures,
		brackets: result.brackets,
		folds: result.folds,
	})
	return result
}

// ============================================================================
// Minimap Token Summary Generation
// ============================================================================

/**
 * Scope to colorId mapping for minimap.
 * Keep colorId space small (0-255) for packed representation.
 */
const generateMinimapSummary = (
	path: string,
	version: number,
	maxChars: number = 160
): MinimapTokenSummary | undefined => {
	const cached = astCache.get(path)
	if (!cached) return undefined

	const text = cached.text
	const captures = cached.captures ?? []

	// Count lines
	const lines = text.split('\n')
	const lineCount = lines.length

	// Allocate buffer for tokens (lineCount * maxChars)
	const totalBytes = lineCount * maxChars
	const buffer = new ArrayBuffer(totalBytes)
	const tokens = new Uint8Array(buffer)

	// Build line start offsets for fast lookup
	const lineStarts: number[] = new Array(lineCount)
	let offset = 0
	for (let i = 0; i < lineCount; i++) {
		lineStarts[i] = offset
		offset += lines[i]!.length + 1 // +1 for newline
	}

	// Process each line
	let captureIndex = 0

	for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
		const lineText = lines[lineIndex]!
		const lineStart = lineStarts[lineIndex]!
		const lineEnd = lineStart + lineText.length

		// Skip past captures that end before this line
		while (
			captureIndex < captures.length &&
			captures[captureIndex]!.endIndex <= lineStart
		) {
			captureIndex++
		}

		const tokenOffset = lineIndex * maxChars
		const sampleLength = Math.min(lineText.length, maxChars)

		// Fill line with tokens
		// Optimization: instead of char-by-char, we can iterate relevant captures
		// Initialize with 0

		// Iterate relevant captures for this line and paint the tokens
		let idx = captureIndex
		while (idx < captures.length && captures[idx]!.startIndex < lineEnd) {
			const capture = captures[idx]!
			const colorId = getScopeColorId(capture.captureName)

			// Calculate intersection with clamped line range [lineStart, lineStart + sampleLength]
			// We only care about the first maxChars of the line
			const sampleEndGlobal = lineStart + sampleLength

			const startGlobal = Math.max(capture.startIndex, lineStart)
			const endGlobal = Math.min(capture.endIndex, sampleEndGlobal)

			if (startGlobal < endGlobal) {
				// Map to local token index
				const startLocal = startGlobal - lineStart
				const endLocal = endGlobal - lineStart

				// Fill range
				for (let i = startLocal; i < endLocal; i++) {
					// Don't overwrite if character is whitespace (keep 0/transparent if we consider 0 as bg)
					// Actually, source code might have whitespace.
					// If we want to see block structure, we should verify it's not a space.
					const charCode = lineText.charCodeAt(i)
					if (charCode !== 32 && charCode !== 9) {
						// space or tab
						tokens[tokenOffset + i] = colorId
					}
				}
			}

			idx++
		}
	}

	return {
		tokens,
		maxChars,
		lineCount,
		version,
	}
}

const api: TreeSitterWorkerApi = {
	async init() {
		await ensureParser()
	},
	async parse(source) {
		const parser = await ensureParser()
		const tree = parser?.parse(source)
		if (!tree) return undefined
		const result = await processTree(tree)
		tree.delete()
		return result
	},
	async parseBuffer(payload) {
		const text = textDecoder.decode(new Uint8Array(payload.buffer))
		return parseAndCacheText(payload.path, text)
	},
	async applyEdit(payload) {
		return reparseWithEdit(payload.path, payload)
	},
	async applyEditBatch(payload) {
		return reparseWithEditBatch(payload.path, payload.edits)
	},
	subscribeMinimapReady(callback) {
		minimapReadySubscribers.add(callback)
		return () => {
			minimapReadySubscribers.delete(callback)
		}
	},
	async getMinimapSummary(payload) {
		return generateMinimapSummary(
			payload.path,
			payload.version,
			payload.maxChars ?? 160
		)
	},
	async dispose() {
		parserInstance?.delete()
		parserInstance = null
		parserInitPromise = null
		minimapReadySubscribers.clear()
		for (const query of highlightQueries) {
			query.delete()
		}
		highlightQueries = []
		for (const query of foldQueries) {
			query.delete()
		}
		foldQueries = []
		for (const entry of astCache.values()) {
			entry.tree.delete()
		}
		astCache.clear()
	},
}

expose(api)

// Handle MessagePort connections from minimap worker
self.addEventListener('message', (event: MessageEvent) => {
	if (
		event.data?.type === 'connect-port' &&
		event.data.port instanceof MessagePort
	) {
		console.log('[TreeSitter] Received port connection from minimap worker')
		// Expose the API on the port for direct worker-to-worker communication
		expose(api, event.data.port)
	}
})
