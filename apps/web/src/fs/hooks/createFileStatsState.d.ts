import type { ParseResult } from '@repo/utils'
export declare const createFileStatsState: () => {
	fileStats: Record<string, ParseResult | undefined>
	setFileStats: (path: string, result?: ParseResult) => void
	clearParseResults: () => void
}
//# sourceMappingURL=createFileStatsState.d.ts.map
