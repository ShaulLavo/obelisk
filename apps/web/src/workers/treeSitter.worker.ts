import { expose } from 'comlink'
import { Parser, Language, Query, Tree } from 'web-tree-sitter'
import type {
	TreeSitterWorkerApi,
	TreeSitterEditPayload,
	TreeSitterCapture,
	BracketInfo,
	TreeSitterParseResult,
	TreeSitterError,
	FoldRange,
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

const setCachedEntry = (path: string, entry: CachedTreeEntry) => {
	const existing = astCache.get(path)
	if (existing && existing.tree !== entry.tree) {
		existing.tree.delete()
	}
	astCache.set(path, entry)
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
	const isWhitespaceOnly = /^[\s\n\r\t]*$/.test(insertedText)
	const hasContent = insertedText.length > 0
	return isInsertion && isWhitespaceOnly && hasContent
}

/**
 * Shifts capture indices after a text insertion.
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
 * Shifts bracket indices after a text insertion.
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
 * Shifts fold ranges after a line insertion.
 * Uses position to calculate line delta.
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
		const charDelta = payload.insertedText.length
		const lineDelta = payload.newEndPosition.row - payload.startPosition.row

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
	const hasCachedData = cached.captures && cached.brackets && cached.folds
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

		for (const edit of edits) {
			const charDelta = edit.insertedText.length
			const lineDelta = edit.newEndPosition.row - edit.startPosition.row

			shiftedCaptures = shiftCaptures(
				shiftedCaptures,
				edit.startIndex,
				charDelta
			)
			shiftedBrackets = shiftBrackets(
				shiftedBrackets,
				edit.startIndex,
				charDelta
			)
			shiftedFolds = shiftFolds(shiftedFolds, edit.startPosition.row, lineDelta)
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
	async dispose() {
		parserInstance?.delete()
		parserInstance = null
		parserInitPromise = null
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
