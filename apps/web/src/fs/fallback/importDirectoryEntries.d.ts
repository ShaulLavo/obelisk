declare const DEFAULT_ROOT_NAME = 'root'
export type NormalizedEntry = {
	file: File
	segments: string[]
}
export declare const normalizeEntries: (files: FileList) => NormalizedEntry[]
export declare const getSharedTopSegment: (
	entries: NormalizedEntry[]
) => string | undefined
export declare const deriveRelativeSegments: (
	entry: NormalizedEntry,
	sharedTop?: string
) => readonly string[]
export { DEFAULT_ROOT_NAME }
//# sourceMappingURL=importDirectoryEntries.d.ts.map
