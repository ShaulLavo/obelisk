/**
 * Path Utilities
 *
 * Centralized path normalization utilities for the FS layer.
 * Tree nodes and cache keys use paths without leading slashes.
 */

/**
 * Normalize path by stripping leading slash.
 * Tree nodes and cache keys use paths without leading slashes.
 *
 * @example normalizePath("/foo/bar.ts") // => "foo/bar.ts"
 * @example normalizePath("foo/bar.ts") // => "foo/bar.ts"
 */
export const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

/**
 * Ensure path has a leading slash for UI display or absolute paths.
 *
 * @example toAbsolutePath("foo/bar.ts") // => "/foo/bar.ts"
 * @example toAbsolutePath("/foo/bar.ts") // => "/foo/bar.ts"
 */
export const toAbsolutePath = (path: string): string =>
	path.startsWith('/') ? path : `/${path}`

/**
 * Check if two paths are equivalent (ignoring leading slash differences).
 *
 * @example pathsEqual("/foo/bar", "foo/bar") // => true
 * @example pathsEqual("foo/bar", "foo/bar") // => true
 */
export const pathsEqual = (a: string, b: string): boolean =>
	normalizePath(a) === normalizePath(b)

/**
 * Get the parent directory path.
 *
 * @example getParentPath("foo/bar/baz.ts") // => "foo/bar"
 * @example getParentPath("foo.ts") // => ""
 */
export const getParentPath = (path: string): string => {
	const normalized = normalizePath(path)
	const lastSlash = normalized.lastIndexOf('/')
	return lastSlash > 0 ? normalized.slice(0, lastSlash) : ''
}

/**
 * Get the file/directory name from a path.
 *
 * @example getBaseName("foo/bar/baz.ts") // => "baz.ts"
 * @example getBaseName("foo.ts") // => "foo.ts"
 */
export const getBaseName = (path: string): string => {
	const normalized = normalizePath(path)
	const lastSlash = normalized.lastIndexOf('/')
	return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
}
