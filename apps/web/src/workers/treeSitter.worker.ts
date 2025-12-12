import { expose } from 'comlink'
import { Parser, Language, Query, Tree } from 'web-tree-sitter'
import type {
	TreeSitterWorkerApi,
	TreeSitterEditPayload,
	TreeSitterCapture,
	BracketInfo,
	TreeSitterParseResult,
	TreeSitterError,
	FoldRange
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
		})().catch(error => {
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

const foldQuerySources = [
	tsFoldsQuerySource,
	jsFoldsQuerySource
].filter(Boolean)

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
	'{': '}'
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
					captureName
				})
			}
		}
	}
	results.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex)
	return results
}

const runFoldQueries = async (tree: Tree | null): Promise<FoldRange[] | undefined> => {
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
					type: node.type
				})
			}
		}
	}

	results.sort(
		(a, b) => a.startLine - b.startLine || a.endLine - b.endLine
	)
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
			depth: bracketStack.length
		})
	} else if (CLOSE_BRACKETS.has(type)) {
		const depth = bracketStack.length > 0 ? bracketStack.length : 1
		visitors.onBracket?.({
			index: node.startIndex,
			char: type,
			depth
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
			message: node.type
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

	walkTree(tree.rootNode, {
		onBracket: info => brackets.push(info),
		onError: info => errors.push(info)
	}, bracketStack)

	return { brackets, errors }
}

const processTree = async (tree: Tree): Promise<TreeSitterParseResult> => {
	const { brackets, errors } = collectTreeData(tree)
	const [captures, folds] = await Promise.all([
		runHighlightQueries(tree),
		runFoldQueries(tree)
	])
	return {
		captures: captures ?? [],
		folds: folds ?? [],
		brackets,
		errors
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
	setCachedEntry(path, { tree, text })
	return processTree(tree)
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
		newEndPosition: payload.newEndPosition
	})

	const nextTree = parser.parse(updatedText, cached.tree)
	if (!nextTree) return undefined

	setCachedEntry(path, { tree: nextTree, text: updatedText })
	return processTree(nextTree)
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
	}
}

expose(api)
