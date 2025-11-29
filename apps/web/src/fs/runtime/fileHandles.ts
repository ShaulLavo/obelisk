import type { FsTreeNode } from '@repo/fs'
import { fileHandleCache } from './fsRuntime'

export function collectFileHandles(node: FsTreeNode) {
	if (node.kind === 'file' && node.handle) {
		fileHandleCache.set(node.path, node.handle)
	}

	if (node.kind === 'dir') {
		for (const child of node.children) {
			collectFileHandles(child)
		}
	}
}
