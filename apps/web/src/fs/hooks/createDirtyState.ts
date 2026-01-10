/* eslint-disable solid/reactivity */
import { createStore } from 'solid-js/store'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const createDirtyState = () => {
	const [dirtyPaths, setDirtyPaths] = createStore<Record<string, boolean>>({})

	const setDirtyPath = (path: string, isDirty: boolean) => {
		setDirtyPaths(normalizePath(path), isDirty)
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
