import type { PieceTableSnapshot } from '@repo/utils'
export declare const createPieceTableState: () => {
	pieceTables: Record<
		string,
		| import('node_modules/@repo/utils/src/pieceTable/pieceTableTypes').PieceTableTreeSnapshot
		| undefined
	>
	setPieceTable: (path: string, snapshot?: PieceTableSnapshot) => void
	clearPieceTables: () => void
}
//# sourceMappingURL=createPieceTableState.d.ts.map
