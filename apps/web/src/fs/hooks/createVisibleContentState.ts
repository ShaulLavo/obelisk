import { createStore, reconcile } from 'solid-js/store'
import type { VisibleContentSnapshot } from '@repo/code-editor'
import { createFilePath } from '@repo/fs'

export const createVisibleContentState = () => {
	const [visibleContents, setVisibleContentsStore] = createStore<
		Record<string, VisibleContentSnapshot | undefined>
	>({})

	const setVisibleContent = (
		path: string,
		content?: VisibleContentSnapshot
	) => {
		if (!path) return
		const p = createFilePath(path)
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
