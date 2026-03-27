import type { Tree } from 'web-tree-sitter'
import type {
	TreeSitterParseResult,
	TreeSitterEditPayload,
	LanguageId,
} from './types'
import { detectLanguage } from './constants'
import { astCache, setCachedEntry } from './cache'
import { ensureParser } from './parser'
import { runHighlightQueries, runFoldQueries } from './queries'
import { collectTreeData } from './treeWalk'
import { applyTextEdit } from './edits'

const textDecoder = new TextDecoder()

type TreeEdit = Omit<TreeSitterEditPayload, 'path' | 'insertedText'>

const applyEditBatch = (
	_path: string,
	text: string,
	tree: Pick<Tree, 'edit'>,
	edits: Omit<TreeSitterEditPayload, 'path'>[]
) => {
	let currentText = text

	for (let index = 0; index < edits.length; index++) {
		const edit = edits[index]
		if (!edit) continue

		currentText = applyTextEdit(
			currentText,
			edit.startIndex,
			edit.oldEndIndex,
			edit.insertedText
		)

		const treeEdit: TreeEdit = {
			startIndex: edit.startIndex,
			oldEndIndex: edit.oldEndIndex,
			newEndIndex: edit.newEndIndex,
			startPosition: edit.startPosition,
			oldEndPosition: edit.oldEndPosition,
			newEndPosition: edit.newEndPosition,
		}
		tree.edit(treeEdit)
	}

	return currentText
}

export const extractTreeAnnotations = (
	tree: Tree,
	languageId: string,
	_path?: string
): TreeSitterParseResult => {
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

export const parseAndCacheText = async (
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
	const result = extractTreeAnnotations(tree, languageId, path)
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

export const parseBufferAndCache = async (
	path: string,
	buffer: ArrayBuffer
): Promise<TreeSitterParseResult | undefined> => {
	const text = textDecoder.decode(new Uint8Array(buffer))
	return parseAndCacheText(path, text)
}

export const reparseWithEdit = async (
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

	const result = extractTreeAnnotations(nextTree, languageId, path)
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

export const reparseWithEditBatch = async (
	path: string,
	edits: Omit<TreeSitterEditPayload, 'path'>[]
): Promise<TreeSitterParseResult | undefined> => {
	if (edits.length === 0) return undefined
	const cached = astCache.get(path)
	if (!cached) {
		return undefined
	}
	const { languageId } = cached
	const res = await ensureParser(languageId as LanguageId)
	if (!res) return undefined
	const { parser } = res

	const currentText = applyEditBatch(path, cached.text, cached.tree, edits)

	const nextTree = parser.parse(currentText, cached.tree)
	if (!nextTree) return undefined

	// Full reparse with queries
	const result = extractTreeAnnotations(nextTree, languageId, path)
	setCachedEntry(path, {
		tree: nextTree,
		text: currentText,
		captures: result.captures,
		brackets: result.brackets,
		folds: result.folds,
		languageId,
	})
	return result
}
