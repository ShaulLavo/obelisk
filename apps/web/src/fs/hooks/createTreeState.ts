import type { DirTreeNode, TreeNode, FilePath } from '@repo/fs'
import { createFilePath } from '@repo/fs'
import { batch } from 'solid-js'
import { createStore, produce, reconcile, type SetStoreFunction } from 'solid-js/store'

export type PathIndex = Record<FilePath, TreeNode>

type TreeState = {
	root: DirTreeNode | undefined
}

const buildPathIndex = (root: DirTreeNode): PathIndex => {
	const index: PathIndex = {}
	const stack: TreeNode[] = [root]

	while (stack.length) {
		const node = stack.pop()!
		if (node.path) {
			index[createFilePath(node.path)] = node
		}
		if (node.kind === 'dir' && node.children) {
			for (const child of node.children) {
				stack.push(child)
			}
		}
	}

	return index
}

const indexTreeNodes = (index: PathIndex, children: TreeNode[]): void => {
	const stack: TreeNode[] = [...children]
	while (stack.length) {
		const node = stack.pop()!
		if (node.path) index[createFilePath(node.path)] = node
		if (node.kind === 'dir' && node.children) {
			for (const child of node.children) stack.push(child)
		}
	}
}

const addChildrenToIndex = (
	setPathIndex: SetStoreFunction<PathIndex>,
	children: TreeNode[]
): void => {
	setPathIndex(produce((index: PathIndex) => indexTreeNodes(index, children)))
}

const findDirInDraft = (
	draft: DirTreeNode,
	targetPath: string
): DirTreeNode | undefined => {
	if (draft.path === targetPath) return draft

	const stack: DirTreeNode[] = [draft]
	while (stack.length) {
		const dir = stack.pop()!
		if (!dir.children) continue

		for (const child of dir.children) {
			if (child.kind === 'dir') {
				if (child.path === targetPath) return child
				if (targetPath.startsWith(child.path + '/')) {
					stack.push(child)
				}
			}
		}
	}

	return undefined
}

export const createTreeState = () => {
	const [treeState, setTreeState] = createStore<TreeState>({ root: undefined })
	const [pathIndex, setPathIndex] = createStore<PathIndex>({})

	const setTreeRoot = (root: DirTreeNode | undefined) => {
		batch(() => {
			setTreeState('root', root)
			if (root) {
				setPathIndex(reconcile(buildPathIndex(root)))
			} else {
				setPathIndex(reconcile({}))
			}
		})
	}

	const applyDirChildren = (draft: DirTreeNode | undefined, path: string, children: TreeNode[]) => {
		if (!draft) return
		const dir = findDirInDraft(draft, path)
		if (!dir) return
		dir.children = children
		dir.isLoaded = true
	}

	const updateTreeDirectory = (path: string, children: TreeNode[]) => {
		batch(() => {
			setTreeState('root', produce((draft) => applyDirChildren(draft, path, children)))
			addChildrenToIndex(setPathIndex, children)
		})
	}

	type PathIndexEntry = { path: string; node: TreeNode }

	const applyBatchDirChildren = (
		draft: DirTreeNode | undefined,
		updates: Array<{ path: string; children: TreeNode[] }>
	) => {
		if (!draft) return
		for (const { path, children } of updates) {
			applyDirChildren(draft, path, children)
		}
	}

	const applyBatchPathIndex = (
		index: PathIndex,
		updates: Array<{ pathIndexEntries: PathIndexEntry[] }>
	) => {
		for (const { pathIndexEntries } of updates) {
			for (const { path, node } of pathIndexEntries) {
				index[createFilePath(path)] = node
			}
		}
	}

	const updateTreeDirectories = (
		updates: Array<{ path: string; children: TreeNode[]; pathIndexEntries: PathIndexEntry[] }>
	) => {
		if (updates.length === 0) return

		batch(() => {
			setTreeState('root', produce((draft) => applyBatchDirChildren(draft, updates)))
			setPathIndex(produce((index: PathIndex) => applyBatchPathIndex(index, updates)))
		})
	}

	const appendChildToDraft = (draft: DirTreeNode | undefined, parentPath: string, node: TreeNode) => {
		if (!draft) return
		const parent = findDirInDraft(draft, parentPath)
		if (!parent) return
		if (!parent.children) parent.children = []
		parent.children.push(node)
	}

	const addTreeNode = (parentPath: string, node: TreeNode) => {
		batch(() => {
			setTreeState('root', produce((draft) => appendChildToDraft(draft, parentPath, node)))
			if (node.path) setPathIndex(createFilePath(node.path), node)
		})
	}

	const removeChildFromDraft = (draft: DirTreeNode | undefined, parentPath: string, childPath: string) => {
		if (!draft) return
		const parent = parentPath ? findDirInDraft(draft, parentPath) : draft
		if (!parent?.children) return
		parent.children = parent.children.filter((c) => c.path !== childPath)
	}

	const purgePathsFromIndex = (index: PathIndex, fp: FilePath) => {
		const toRemove = Object.keys(index).filter((p) => p === fp || p.startsWith(fp + '/'))
		for (const p of toRemove) delete index[p as FilePath]
	}

	const removeTreeNode = (path: string) => {
		const fp = createFilePath(path)
		const parentPath = path.split('/').slice(0, -1).join('/')

		batch(() => {
			setTreeState('root', produce((draft) => removeChildFromDraft(draft, parentPath, path)))
			setPathIndex(produce((index) => purgePathsFromIndex(index, fp)))
		})
	}

	const getNode = (path: string): TreeNode | undefined => {
		return pathIndex[createFilePath(path)]
	}

	return {
		get tree() {
			return treeState.root
		},
		pathIndex,
		setTreeRoot,
		updateTreeDirectory,
		updateTreeDirectories,
		addTreeNode,
		removeTreeNode,
		getNode,
	}
}
