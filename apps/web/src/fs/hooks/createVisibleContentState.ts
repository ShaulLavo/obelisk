import { createStore, reconcile } from 'solid-js/store'
import type { VisibleContentSnapshot } from '@repo/code-editor'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const createVisibleContentState = () => {
	const [visibleContents, setVisibleContentsStore] = createStore<
		Record<string, VisibleContentSnapshot | undefined>
	>({})

	const setVisibleContent = (
		path: string,
		content?: VisibleContentSnapshot
	) => {
		if (!path) return
		const p = normalizePath(path)
		if (!content) {
			setVisibleContentsStore(p, undefined)
			return
		}

		setVisibleContentsStore(p, content)
	}

	const clearVisibleContents = () => {
		setVisibleContentsStore(reconcile({}))
	}

	return {
		visibleContents,
		setVisibleContent,
		clearVisibleContents,
	}
}
