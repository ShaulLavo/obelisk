import type { Tree } from 'web-tree-sitter'
import type { SyntaxNode, BracketInfo, TreeSitterError } from './types'
import { BRACKET_PAIRS, OPEN_BRACKETS, CLOSE_BRACKETS } from './constants'

export type TreeWalkVisitors = {
	onBracket?: (info: BracketInfo) => void
	onError?: (info: TreeSitterError) => void
}

export const walkTree = (
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

export const collectTreeData = (tree: Tree) => {
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
