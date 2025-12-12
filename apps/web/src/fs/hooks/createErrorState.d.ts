import type { TreeSitterError } from '../../workers/treeSitterWorkerTypes'
export declare const createErrorState: () => {
	fileErrors: Record<string, TreeSitterError[] | undefined>
	setErrors: (path: string, errors?: TreeSitterError[]) => void
	clearErrors: () => void
}
//# sourceMappingURL=createErrorState.d.ts.map
