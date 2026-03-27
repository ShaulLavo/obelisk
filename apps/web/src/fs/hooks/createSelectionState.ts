/* eslint-disable solid/reactivity */
import { makePersisted } from '@solid-primitives/storage'
import { createSignal, type Accessor } from 'solid-js'
import { createMemorySafeStorage } from '@repo/utils/safeLocalStorage'
import { getDefaultSource } from '../config/constants'
import { createFilePath, type FilePath } from '@repo/fs'

export const createSelectionState = () => {
	const [rawSelectedPath, rawSetSelectedPath] = makePersisted(
		createSignal<string | undefined>(undefined),
		{
			name: 'fs-selected-path',
		}
	)

	const selectedPath: Accessor<FilePath | undefined> = () => {
		const raw = rawSelectedPath()
		return raw ? createFilePath(raw) : undefined
	}

	const setSelectedPath = (value: FilePath | string | undefined) => {
		rawSetSelectedPath(value ?? undefined)
	}
	const memorySafeStorage = createMemorySafeStorage()

	const [activeSource, setActiveSource] = makePersisted(
		createSignal(getDefaultSource()),
		{
			name: 'fs-active-source',
			storage: memorySafeStorage,
		}
	)

	return {
		selectedPath,
		setSelectedPath,
		activeSource,
		setActiveSource,
	}
}
