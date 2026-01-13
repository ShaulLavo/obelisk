/**
 * Path Utilities
 *
 * Re-exports from the branded FilePath type for backwards compatibility.
 * Prefer importing directly from '@repo/fs' for new code.
 */

export {
	createFilePath,
	filePathEquals,
	filePathToString,
	toPosix,
	toDisplayPath,
	getParentPath,
	getBaseName,
	getExtension,
	joinPath,
	isChildOf,
	isRootPath,
	type FilePath,
} from '@repo/fs'

/**
 * Ensure path has a leading slash for UI display or absolute paths.
 * Alias for toDisplayPath.
 *
 * @example toAbsolutePath("foo/bar.ts") // => "/foo/bar.ts"
 * @example toAbsolutePath("/foo/bar.ts") // => "/foo/bar.ts"
 */
export const toAbsolutePath = (path: string): string =>
	path.startsWith('/') ? path : `/${path}`
