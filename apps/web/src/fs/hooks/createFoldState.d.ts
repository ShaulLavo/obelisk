import type { FoldRange } from '../../workers/treeSitterWorkerTypes'
export declare const createFoldState: () => {
	fileFolds: Record<string, FoldRange[] | undefined>
	setFolds: (path: string, folds?: FoldRange[]) => void
	clearFolds: () => void
}
//# sourceMappingURL=createFoldState.d.ts.map
