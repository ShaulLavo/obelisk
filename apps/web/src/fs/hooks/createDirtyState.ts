/* eslint-disable solid/reactivity */
import { createStore } from 'solid-js/store'

export const createDirtyState = () => {
	const [dirtyPaths, setDirtyPaths] = createStore<Record<string, boolean>>({})

	const setDirtyPath = (path: string, isDirty: boolean) => {
		setDirtyPaths(path, isDirty)
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
