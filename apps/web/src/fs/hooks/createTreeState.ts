import type { FsDirTreeNode, FsTreeNode, FilePath } from '@repo/fs'
import { createFilePath } from '@repo/fs'
import { batch } from 'solid-js'
import { createStore, produce, reconcile, type SetStoreFunction } from 'solid-js/store'

export type PathIndex = Record<FilePath, FsTreeNode>

type TreeState = {
	root: FsDirTreeNode | undefined
}

const buildPathIndex = (root: FsDirTreeNode): PathIndex => {
	const index: PathIndex = {}
	const stack: FsTreeNode[] = [root]

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

const addChildrenToIndex = (
	setPathIndex: SetStoreFunction<PathIndex>,
	children: FsTreeNode[]
): void => {
	setPathIndex(
		produce((index: PathIndex) => {
			const stack: FsTreeNode[] = [...children]
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
		})
	)
}

const findDirInDraft = (
	draft: FsDirTreeNode,
	targetPath: string
): FsDirTreeNode | undefined => {
	if (draft.path === targetPath) return draft

	const stack: FsDirTreeNode[] = [draft]
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

	const setTreeRoot = (root: FsDirTreeNode | undefined) => {
		batch(() => {
			setTreeState('root', root)
			if (root) {
				setPathIndex(reconcile(buildPathIndex(root)))
			} else {
				setPathIndex(reconcile({}))
			}
		})
	}

	const updateTreeDirectory = (path: string, children: FsTreeNode[]) => {
		batch(() => {
			setTreeState(
				'root',
				produce((draft) => {
					if (!draft) return
					const dir = findDirInDraft(draft, path)
					if (dir) {
						dir.children = children
						dir.isLoaded = true
					}
				})
			)
			addChildrenToIndex(setPathIndex, children)
		})
	}

	type PathIndexEntry = { path: string; node: FsTreeNode }

	const updateTreeDirectories = (
		updates: Array<{ path: string; children: FsTreeNode[]; pathIndexEntries: PathIndexEntry[] }>
	) => {
		if (updates.length === 0) return

		batch(() => {
			setTreeState(
				'root',
				produce((draft) => {
					if (!draft) return
					for (const { path, children } of updates) {
						const dir = findDirInDraft(draft, path)
						if (dir) {
							dir.children = children
							dir.isLoaded = true
						}
					}
				})
			)
			setPathIndex(
				produce((index: PathIndex) => {
					for (const { pathIndexEntries } of updates) {
						for (const { path, node } of pathIndexEntries) {
							index[createFilePath(path)] = node
						}
					}
				})
			)
		})
	}

	const addTreeNode = (parentPath: string, node: FsTreeNode) => {
		batch(() => {
			setTreeState(
				'root',
				produce((draft) => {
					if (!draft) return
					const parent = findDirInDraft(draft, parentPath)
					if (parent) {
						if (!parent.children) {
							parent.children = []
						}
						parent.children.push(node)
					}
				})
			)
			if (node.path) {
				setPathIndex(createFilePath(node.path), node)
			}
		})
	}

	const removeTreeNode = (path: string) => {
		const fp = createFilePath(path)
		const parentPath = path.split('/').slice(0, -1).join('/')

		batch(() => {
			setTreeState(
				'root',
				produce((draft) => {
					if (!draft) return
					const parent = parentPath ? findDirInDraft(draft, parentPath) : draft
					if (parent && parent.children) {
						parent.children = parent.children.filter((c) => c.path !== path)
					}
				})
			)
			setPathIndex(
				produce((index) => {
					const toRemove = Object.keys(index).filter(
						(p) => p === fp || p.startsWith(fp + '/')
					)
					for (const p of toRemove) {
						delete index[p as FilePath]
					}
				})
			)
		})
	}

	const getNode = (path: string): FsTreeNode | undefined => {
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
