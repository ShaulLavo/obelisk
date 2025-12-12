import type { BracketInfo } from '../../workers/treeSitterWorkerTypes'
export declare const createBracketState: () => {
	fileBrackets: Record<string, BracketInfo[] | undefined>
	setBrackets: (path: string, brackets?: BracketInfo[]) => void
	clearBrackets: () => void
}
//# sourceMappingURL=createBracketState.d.ts.map
