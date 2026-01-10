/* eslint-disable solid/reactivity */
import { createStore, reconcile } from 'solid-js/store'
import type { PieceTableSnapshot } from '@repo/utils'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const createPieceTableState = () => {
	const [pieceTables, setPieceTablesStore] = createStore<
		Record<string, PieceTableSnapshot | undefined>
	>({})

	const evictPieceTableEntry = (path: string) => {
		setPieceTablesStore(normalizePath(path), undefined)
	}

	const setPieceTable = (path: string, snapshot?: PieceTableSnapshot) => {
		if (!path) return
		const normalized = normalizePath(path)
		if (!snapshot) {
			evictPieceTableEntry(normalized)
			return
		}

		setPieceTablesStore(normalized, snapshot)
	}

	const clearPieceTables = () => {
		setPieceTablesStore(reconcile({}))
	}

	return {
		pieceTables,
		setPieceTable,
		clearPieceTables,
	}
}
