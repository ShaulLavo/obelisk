import { expose, proxy } from 'comlink'
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
	languageId: string
}

let parserInstance: Parser | null = null
let parserInitPromise: Promise<void> | null = null
const languageCache = new Map<string, Language>()
const queryCache = new Map<string, { highlight: Query[]; fold: Query[] }>()

const textDecoder = new TextDecoder()
const astCache = new Map<string, CachedTreeEntry>()

const locateWasm = () => '/tree-sitter/tree-sitter.wasm'

type LanguageId = 'typescript' | 'tsx' | 'javascript' | 'jsx' | 'json' | 'html'

const EXTENSION_MAP: Record<string, LanguageId> = {
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'jsx',
	json: 'json',
	html: 'html',
	htm: 'html',
}

const LANGUAGE_CONFIG: Record<
	LanguageId,
	{
		wasm: string
		highlightQueries: string[]
		foldQueries: string[]
	}
> = {
	typescript: {
		wasm: '/tree-sitter/tree-sitter-typescript.wasm',
		highlightQueries: [tsHighlightsQuerySource, jsHighlightsQuerySource],
		foldQueries: [tsFoldsQuerySource, jsFoldsQuerySource],
	},
	tsx: {
		wasm: '/tree-sitter/tree-sitter-tsx.wasm',
		highlightQueries: [
			tsHighlightsQuerySource,
			jsHighlightsQuerySource,
			jsJsxHighlightsQuerySource,
		],
		foldQueries: [tsFoldsQuerySource, jsFoldsQuerySource],
	},
	javascript: {
		wasm: '/tree-sitter/tree-sitter-javascript.wasm',
		highlightQueries: [jsHighlightsQuerySource],
		foldQueries: [jsFoldsQuerySource],
	},
	jsx: {
		wasm: '/tree-sitter/tree-sitter-javascript.wasm',
		highlightQueries: [jsHighlightsQuerySource, jsJsxHighlightsQuerySource],
		foldQueries: [jsFoldsQuerySource],
	},
	json: {
		wasm: '/tree-sitter/tree-sitter-json.wasm',
		highlightQueries: ['/tree-sitter/json-highlights.scm'],
		foldQueries: [],
	},
	html: {
		wasm: '/tree-sitter/tree-sitter-html.wasm',
		highlightQueries: ['/tree-sitter/html-highlights.scm'],
		foldQueries: [],
	},
}

const detectLanguage = (path: string): LanguageId | undefined => {
	const ext = path.split('.').pop()?.toLowerCase()
	return ext ? EXTENSION_MAP[ext] : undefined
}

const fetchQuery = async (url: string): Promise<string> => {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Failed to fetch query: ${url}`)
	return res.text()
}

const ensureParser = async (languageId?: LanguageId) => {
	if (!parserInitPromise) {
		parserInitPromise = (async () => {
			await Parser.init({ locateFile: locateWasm })
			parserInstance = new Parser()
		})().catch((error) => {
			parserInitPromise = null
			log.error('Tree-sitter parser init failed', error)
			throw error
		})
	}
	await parserInitPromise

	if (!languageId || !LANGUAGE_CONFIG[languageId]) return undefined
	const config = LANGUAGE_CONFIG[languageId]

	if (!parserInstance) return undefined

	// Load Language if not cached
	let language = languageCache.get(languageId)
	if (!language) {
		try {
			language = await Language.load(config.wasm)
			languageCache.set(languageId, language)
		} catch (e) {
			log.error(`Failed to load language ${languageId}`, e)
			return undefined
		}
	}

	parserInstance.setLanguage(language)

	// Load Queries if not cached
	if (!queryCache.has(languageId)) {
		const highlightQueries: Query[] = []
		const foldQueries: Query[] = []

		try {
			// Combine sources
			let combinedHighlightSource = ''
			for (const source of config.highlightQueries) {
				if (source.startsWith('/')) {
					combinedHighlightSource += (await fetchQuery(source)) + '\n'
				} else {
					combinedHighlightSource += source + '\n'
				}
			}

			let combinedFoldSource = ''
			for (const source of config.foldQueries) {
				if (source.startsWith('/')) {
					combinedFoldSource += (await fetchQuery(source)) + '\n'
				} else {
					combinedFoldSource += source + '\n'
				}
			}

			if (combinedHighlightSource.trim()) {
				highlightQueries.push(new Query(language, combinedHighlightSource))
			}
			if (combinedFoldSource.trim()) {
				foldQueries.push(new Query(language, combinedFoldSource))
			}
		} catch (e) {
			log.error(`Failed to load queries for ${languageId}`, e)
		}

		queryCache.set(languageId, {
			highlight: highlightQueries,
			fold: foldQueries,
		})
	}

	return { parser: parserInstance, languageId }
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

const runHighlightQueries = (
	tree: Tree,
	languageId: string
): TreeSitterCapture[] => {
	const queries = queryCache.get(languageId)?.highlight || []
	if (!queries.length) return []

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

const runFoldQueries = (tree: Tree, languageId: string): FoldRange[] => {
	const queries = queryCache.get(languageId)?.fold || []
	if (!queries.length) return []

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

const processTree = async (
	tree: Tree,
	languageId: string
): Promise<TreeSitterParseResult> => {
	const { brackets, errors } = collectTreeData(tree)
	const captures = runHighlightQueries(tree, languageId)
	const folds = runFoldQueries(tree, languageId)
	return {
		captures,
		folds,
		brackets,
		errors,
	}
}

const parseAndCacheText = async (
	path: string,
	text: string
): Promise<TreeSitterParseResult | undefined> => {
	const languageId = detectLanguage(path)
	if (!languageId) return undefined

	const res = await ensureParser(languageId)
	if (!res) return undefined
	const { parser } = res

	const tree = parser.parse(text)
	if (!tree) return undefined
	const result = await processTree(tree, languageId)
	setCachedEntry(path, {
		tree,
		text,
		captures: result.captures,
		brackets: result.brackets,
		folds: result.folds,
		languageId,
	})
	return result
}

const reparseWithEdit = async (
	path: string,
	payload: TreeSitterEditPayload
): Promise<TreeSitterParseResult | undefined> => {
	const cached = astCache.get(path)
	if (!cached) return undefined
	const { languageId } = cached

	const res = await ensureParser(languageId as LanguageId)
	if (!res) return undefined
	const { parser } = res

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
			languageId,
		})

		return result
	}

	// Full reparse with queries
	const result = await processTree(nextTree, languageId)
	setCachedEntry(path, {
		tree: nextTree,
		text: updatedText,
		captures: result.captures,
		brackets: result.brackets,
		folds: result.folds,
		languageId,
	})
	return result
}

const reparseWithEditBatch = async (
	path: string,
	edits: Omit<TreeSitterEditPayload, 'path'>[]
): Promise<TreeSitterParseResult | undefined> => {
	if (edits.length === 0) return undefined
	const cached = astCache.get(path)
	if (!cached) {
		log.warn('[reparseWithEditBatch] No cached entry for path:', path)
		return undefined
	}
	const { languageId } = cached
	const res = await ensureParser(languageId as LanguageId)
	if (!res) return undefined
	const { parser } = res

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
			languageId,
		})

		return result
	}

	// Full reparse with queries
	const result = await processTree(currentTree, languageId)
	setCachedEntry(path, {
		tree: currentTree,
		text: currentText,
		captures: result.captures,
		brackets: result.brackets,
		folds: result.folds,
		languageId,
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
		// This old parse method assumes TSX or default language which is not ideal anymore
		// But it's usually not used?
		// We'll default to typescript if called without context, or just fail.
		const res = await ensureParser('typescript')
		if (!res) return undefined
		const { parser } = res
		const tree = parser.parse(source)
		if (!tree) return undefined
		const result = await processTree(tree, 'typescript')
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
		return proxy(() => {
			minimapReadySubscribers.delete(callback)
		})
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

		languageCache.clear()

		queryCache.forEach((entry) => {
			entry.highlight.forEach((q) => q.delete())
			entry.fold.forEach((q) => q.delete())
		})
		queryCache.clear()

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
		log.info('Received port connection from minimap worker')
		// Explicit MessagePort transfers make origin checks unnecessary in this same-origin worker context.
		// Expose the API on the port for direct worker-to-worker communication
		expose(api, event.data.port)
	}
})
