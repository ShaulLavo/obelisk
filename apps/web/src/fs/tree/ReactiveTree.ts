/**
 * Reactive tree using Solid's createStore for fine-grained updates.
 * Path-based setters ensure minimal reactivity triggers.
 */

import { createStore } from 'solid-js/store'
import type { FsTreeNode, FsDirTreeNode } from '@repo/fs'

type TreeState = {
	root: FsDirTreeNode | undefined
	dirs: Record<string, FsDirTreeNode>
}

export type ReactiveTree = {
	getDir: (path: string) => FsDirTreeNode | undefined
	getRoot: () => FsDirTreeNode | undefined
	setRoot: (node: FsDirTreeNode) => void
	updateDirectory: (path: string, children: FsTreeNode[]) => void
	clear: () => void
}

export const createReactiveTree = (): ReactiveTree => {
	const [state, setState] = createStore<TreeState>({
		root: undefined,
		dirs: {},
	})

	const registerDir = (node: FsDirTreeNode, batch: Record<string, FsDirTreeNode>) => {
		batch[node.path] = node
		for (const child of node.children) {
			if (child.kind === 'dir') {
				registerDir(child, batch)
			}
		}
	}

	return {
		getDir: (path) => state.dirs[path],
		getRoot: () => state.root,

		setRoot(node) {
			const batch: Record<string, FsDirTreeNode> = {}
			registerDir(node, batch)
			setState({
				root: node,
				dirs: batch,
			})
		},

		updateDirectory(path, children) {
			const dir = state.dirs[path]
			if (!dir) return

			// Collect new dirs to register
			const newDirs: Record<string, FsDirTreeNode> = {}
			for (const child of children) {
				if (child.kind === 'dir') {
					registerDir(child, newDirs)
				}
			}

			// Update dir entry with new children
			setState('dirs', path, {
				...dir,
				children,
				isLoaded: true,
			})

			// Register any new child directories
			if (Object.keys(newDirs).length > 0) {
				setState('dirs', (dirs) => ({ ...dirs, ...newDirs }))
			}
		},

		clear() {
			setState({ root: undefined, dirs: {} })
		},
	}
}
