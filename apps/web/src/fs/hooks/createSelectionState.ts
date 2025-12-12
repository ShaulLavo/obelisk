/* eslint-disable solid/reactivity */
import { makePersisted } from '@solid-primitives/storage'
import { createSignal } from 'solid-js'
import { DEFAULT_SOURCE } from '../config/constants'

export const createSelectionState = () => {
	const [selectedPath, setSelectedPath] = makePersisted(
		createSignal<string | undefined>(undefined),
		{
			name: 'fs-selected-path'
		}
	)
	const memorySafeStorage =
		typeof window === 'undefined'
			? undefined
			: {
				getItem: (key: string) => window.localStorage.getItem(key),
				setItem: (key: string, value: string) => {
					let parsed: unknown = value
					try {
						parsed = JSON.parse(value)
					} catch {
						// ignore parse failures
					}

					if (parsed === 'memory') {
						window.localStorage.removeItem(key)
						return
					}

					window.localStorage.setItem(key, value)
				},
				removeItem: (key: string) => window.localStorage.removeItem(key)
			}

	const [activeSource, setActiveSource] = makePersisted(
		createSignal(DEFAULT_SOURCE),
		{
			name: 'fs-active-source',
			storage: memorySafeStorage
		}
	)

	return {
		selectedPath,
		setSelectedPath,
		activeSource,
		setActiveSource
	}
}
