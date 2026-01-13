/* eslint-disable solid/reactivity */
import { createStore } from 'solid-js/store'
import { createFilePath } from '@repo/fs'

export const createDirtyState = () => {
	const [dirtyPaths, setDirtyPaths] = createStore<Record<string, boolean>>({})

	const setDirtyPath = (path: string, isDirty?: boolean) => {
		const p = createFilePath(path)
		if (isDirty === undefined || isDirty === false) {
			setDirtyPaths(p, undefined as unknown as boolean)
		} else {
			setDirtyPaths(p, isDirty)
		}
	}

	const clearDirtyPaths = () => {
		setDirtyPaths({})
	}

	return {
		dirtyPaths,
		setDirtyPath,
		clearDirtyPaths,
	}
}
