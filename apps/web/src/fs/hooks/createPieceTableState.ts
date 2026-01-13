/* eslint-disable solid/reactivity */
import { createStore, reconcile } from 'solid-js/store'
import type { PieceTableSnapshot } from '@repo/utils'
import { createFilePath } from '@repo/fs'

export const createPieceTableState = () => {
	const [pieceTables, setPieceTablesStore] = createStore<
		Record<string, PieceTableSnapshot | undefined>
	>({})

	const evictPieceTableEntry = (path: string) => {
		setPieceTablesStore(createFilePath(path), undefined)
	}

	const setPieceTable = (path: string, snapshot?: PieceTableSnapshot) => {
		if (!path) return
		const normalized = createFilePath(path)
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
