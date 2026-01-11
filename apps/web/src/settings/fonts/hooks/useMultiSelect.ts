import { createSignal } from 'solid-js'

export function useMultiSelect<T extends string>() {
	const [selected, setSelected] = createSignal<Set<T>>(new Set())
	const [isSelectMode, setIsSelectMode] = createSignal(false)

	const toggle = (id: T) => {
		setSelected((prev: Set<T>) => {
			const next = new Set(prev)
			if (next.has(id)) {
				next.delete(id)
			} else {
				next.add(id)
			}
			return next
		})
	}

	const selectAll = (ids: T[]) => {
		setSelected(new Set(ids))
	}

	const clearSelection = () => {
		setSelected(new Set<T>())
	}

	const enterSelectMode = () => {
		setIsSelectMode(true)
	}

	const exitSelectMode = () => {
		setIsSelectMode(false)
		clearSelection()
	}

	const isSelected = (id: T) => selected().has(id)
	const count = () => selected().size

	return {
		selected,
		isSelectMode,
		toggle,
		selectAll,
		clearSelection,
		enterSelectMode,
		exitSelectMode,
		isSelected,
		count,
	}
}
