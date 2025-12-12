/** Options for controlling import behavior */
export interface ImportOptions {
	/**
	 * If true, files are merged into the existing directory without clearing.
	 * Existing files with the same path will be overwritten.
	 */
	skipClear?: boolean
	/**
	 * If provided, this function is called before any destructive operation.
	 * If it returns false or rejects, the import is cancelled.
	 * Only called when skipClear is false (destructive import).
	 */
	confirmDestructive?: () => boolean | Promise<boolean>
}
declare const hasOpfsAccess: () => boolean
/**
 * Imports a directory to OPFS with safe write semantics.
 *
 * By default (skipClear: false), this performs a destructive import:
 * 1. Writes all files to a temporary directory first
 * 2. If all writes succeed, backs up the existing appRoot
 * 3. Atomically moves temp directory contents to appRoot
 * 4. Cleans up backup on success
 * 5. On any failure, restores from backup and cleans up temp
 *
 * With skipClear: true, files are merged into the existing directory.
 */
export declare function importDirectoryToOpfs(
	files: FileList,
	options?: ImportOptions
): Promise<FileSystemDirectoryHandle>
export { hasOpfsAccess }
//# sourceMappingURL=importDirectoryToOpfs.d.ts.map
