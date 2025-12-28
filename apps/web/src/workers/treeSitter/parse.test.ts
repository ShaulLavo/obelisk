import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tree } from 'web-tree-sitter'
import type { TreeSitterEditPayload } from './types'
import { astCache, clearAstCache } from './cache'
import { reparseWithEditBatch } from './parse'

type TreeEdit = Omit<TreeSitterEditPayload, 'path' | 'insertedText'>
type ParseFn = (text: string, tree?: Tree) => Tree | null

const parseMock = vi.fn<ParseFn>()

vi.mock('./parser', () => ({
	ensureParser: vi.fn(async () => ({
		parser: {
			parse: parseMock,
		},
		languageId: 'typescript',
	})),
}))

vi.mock('./queries', () => ({
	runHighlightQueries: vi.fn(() => []),
	runFoldQueries: vi.fn(() => []),
}))

vi.mock('./treeWalk', () => ({
	collectTreeData: vi.fn(() => ({ brackets: [], errors: [] })),
}))

const createMockTree = () => {
	const edit = vi.fn<(edit: TreeEdit) => void>()
	const deleteFn = vi.fn<() => void>()
	const tree = { edit, delete: deleteFn } as unknown as Tree
	return { tree, edit, deleteFn }
}

describe('reparseWithEditBatch', () => {
	afterEach(() => {
		clearAstCache()
		vi.clearAllMocks()
	})

	it('parses once after applying batch edits', async () => {
		const cached = createMockTree()
		astCache.set('file.ts', {
			tree: cached.tree,
			text: 'ab',
			captures: [],
			brackets: [],
			folds: [],
			languageId: 'typescript',
		})

		const next = createMockTree()
		parseMock.mockReturnValueOnce(next.tree)

		const edits: Omit<TreeSitterEditPayload, 'path'>[] = [
			{
				startIndex: 1,
				oldEndIndex: 1,
				newEndIndex: 2,
				startPosition: { row: 0, column: 1 },
				oldEndPosition: { row: 0, column: 1 },
				newEndPosition: { row: 0, column: 2 },
				insertedText: 'x',
			},
			{
				startIndex: 2,
				oldEndIndex: 3,
				newEndIndex: 2,
				startPosition: { row: 0, column: 2 },
				oldEndPosition: { row: 0, column: 3 },
				newEndPosition: { row: 0, column: 2 },
				insertedText: '',
			},
		]

		const result = await reparseWithEditBatch('file.ts', edits)

		expect(parseMock).toHaveBeenCalledTimes(1)
		expect(cached.edit).toHaveBeenCalledTimes(2)
		expect(parseMock).toHaveBeenCalledWith('ax', cached.tree)
		expect(result).toEqual({
			captures: [],
			brackets: [],
			errors: [],
			folds: [],
		})
		expect(astCache.get('file.ts')?.text).toBe('ax')
	})
})
