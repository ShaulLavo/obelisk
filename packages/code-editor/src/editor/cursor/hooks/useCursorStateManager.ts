import {
	createEffect,
	createMemo,
	on,
	type Accessor
} from 'solid-js'
import { createStore } from 'solid-js/store'
import type { LineEntry } from '../../types'
import type { CursorState } from '../types'
import { createDefaultCursorState } from '../types'
import { offsetToPosition } from '../utils/position'

type UseCursorStateManagerOptions = {
	filePath: () => string | undefined
	lineEntries: () => LineEntry[]
	documentLength: () => number
}

export type CursorStateManager = {
	currentState: Accessor<CursorState>
	updateCurrentState: (
		updater: (prev: CursorState) => Partial<CursorState>
	) => void
}

export function useCursorStateManager(
	options: UseCursorStateManagerOptions
): CursorStateManager {
	const [cursorStates, setCursorStates] = createStore<
		Record<string, CursorState>
	>({})

	const currentPath = createMemo(() => options.filePath())

	const currentState = createMemo((): CursorState => {
		const path = currentPath()
		if (!path) {
			return createDefaultCursorState()
		}
		return cursorStates[path] ?? createDefaultCursorState()
	})

	const updateCurrentState = (
		updater: (prev: CursorState) => Partial<CursorState>
	) => {
		const path = currentPath()
		if (!path) return

		const current = cursorStates[path] ?? createDefaultCursorState()
		const updates = updater(current)
		setCursorStates(path, { ...current, ...updates })
	}

	createEffect(
		on(currentPath, path => {
			if (!path || cursorStates[path]) return
			setCursorStates(path, createDefaultCursorState())
		})
	)

	createEffect(
		on(
			() => options.documentLength(),
			length => {
				const state = currentState()
				if (state.position.offset > length) {
					const newPosition = offsetToPosition(length, options.lineEntries())
					updateCurrentState(() => ({
						position: newPosition,
						preferredColumn: newPosition.column
					}))
				}
			}
		)
	)

	return {
		currentState,
		updateCurrentState
	}
}
