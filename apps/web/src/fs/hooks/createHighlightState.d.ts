import type { TreeSitterCapture } from '../../workers/treeSitterWorkerTypes'
export declare const createHighlightState: () => {
	fileHighlights: Record<string, TreeSitterCapture[] | undefined>
	setHighlights: (path: string, highlights?: TreeSitterCapture[]) => void
	clearHighlights: () => void
}
//# sourceMappingURL=createHighlightState.d.ts.map
