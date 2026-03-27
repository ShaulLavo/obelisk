import type { Tree } from 'web-tree-sitter'
import type { TreeSitterCapture, FoldRange, SyntaxNode } from './types'
import { queryCache } from './parser'

export const runHighlightQueries = (
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
				const scope = capture.name ?? ''
				const startIndex = capture.node.startIndex
				const endIndex = capture.node.endIndex
				const key = `${startIndex}:${endIndex}:${scope}`
				if (seen.has(key)) continue
				seen.add(key)
				results.push({
					startIndex,
					endIndex,
					scope,
				})
			}
		}
	}
	results.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex)
	return results
}

/**
 * Check if a node type requires a block body to be foldable.
 * Returns true if the node has substantive content to fold.
 */
const hasFoldableBody = (node: NonNullable<SyntaxNode>): boolean => {
	const type = node.type

	if (type === 'arrow_function') {
		const body = node.childForFieldName('body')
		return body?.type === 'statement_block'
	}

	const controlFlowTypes = [
		'if_statement',
		'for_statement',
		'for_in_statement',
		'while_statement',
		'do_statement',
	]

	if (controlFlowTypes.includes(type)) {
		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i)
			if (child?.type === 'statement_block') {
				if (child.namedChildCount > 0) {
					return true
				}
			}
		}
		return false
	}

	return true
}

export const runFoldQueries = (tree: Tree, languageId: string): FoldRange[] => {
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

				if (!hasFoldableBody(node)) continue

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
