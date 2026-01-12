/**
 * FilePath - Branded type for normalized file paths
 *
 * Enforces path normalization at construction time, eliminating
 * the need for ad-hoc normalization at call sites.
 *
 * All file paths in the system should use this type to ensure
 * consistent identity across caches, stores, and registries.
 *
 * Normalized form: No leading slash (e.g., "foo/bar.ts" not "/foo/bar.ts")
 */

declare const FilePathBrand: unique symbol

/**
 * Branded string type representing a normalized file path.
 * Cannot be created directly - must use createFilePath().
 */
export type FilePath = string & { readonly [FilePathBrand]: true }

/**
 * Create a FilePath from a raw string.
 * Normalizes the path by removing leading slashes.
 *
 * @example
 * createFilePath("/foo/bar.ts") // => "foo/bar.ts" as FilePath
 * createFilePath("foo/bar.ts")  // => "foo/bar.ts" as FilePath
 * createFilePath("")            // => "" as FilePath (empty path)
 */
export function createFilePath(raw: string): FilePath {
	if (!raw) return '' as FilePath
	const normalized = raw.startsWith('/') ? raw.slice(1) : raw
	return normalized as FilePath
}

/**
 * Check if two FilePaths are equal.
 * Since FilePaths are already normalized, this is a direct string comparison.
 */
export function filePathEquals(a: FilePath, b: FilePath): boolean {
	return a === b
}

/**
 * Convert a FilePath to a display path with leading slash.
 * Use this when showing paths to users in the UI.
 *
 * @example
 * toDisplayPath(createFilePath("foo/bar.ts")) // => "/foo/bar.ts"
 */
export function toDisplayPath(fp: FilePath): string {
	if (!fp) return '/'
	return `/${fp}`
}

/**
 * Get the parent directory of a FilePath.
 *
 * @example
 * getParentPath(createFilePath("foo/bar/baz.ts")) // => "foo/bar" as FilePath
 * getParentPath(createFilePath("foo.ts"))         // => "" as FilePath (root)
 */
export function getParentPath(fp: FilePath): FilePath {
	const lastSlash = fp.lastIndexOf('/')
	if (lastSlash <= 0) return '' as FilePath
	return fp.slice(0, lastSlash) as FilePath
}

/**
 * Get the base name (file or directory name) from a FilePath.
 *
 * @example
 * getBaseName(createFilePath("foo/bar/baz.ts")) // => "baz.ts"
 * getBaseName(createFilePath("foo.ts"))         // => "foo.ts"
 */
export function getBaseName(fp: FilePath): string {
	const lastSlash = fp.lastIndexOf('/')
	return lastSlash >= 0 ? fp.slice(lastSlash + 1) : fp
}

/**
 * Get the file extension from a FilePath.
 *
 * @example
 * getExtension(createFilePath("foo/bar.ts"))   // => ".ts"
 * getExtension(createFilePath("foo/bar"))      // => ""
 * getExtension(createFilePath("foo/.gitignore")) // => ""
 */
export function getExtension(fp: FilePath): string {
	const base = getBaseName(fp)
	const dotIndex = base.lastIndexOf('.')
	// No dot, or dot at start (hidden file), or dot at end
	if (dotIndex <= 0 || dotIndex === base.length - 1) return ''
	return base.slice(dotIndex)
}

/**
 * Join path segments into a FilePath.
 *
 * @example
 * joinPath(createFilePath("foo"), "bar", "baz.ts") // => "foo/bar/baz.ts" as FilePath
 */
export function joinPath(base: FilePath, ...segments: string[]): FilePath {
	const parts = [base, ...segments].filter(Boolean)
	const joined = parts.join('/')
	// Re-normalize in case any segment had leading slashes
	return createFilePath(joined)
}

/**
 * Check if a path is a child of another path.
 *
 * @example
 * isChildOf(createFilePath("foo/bar/baz.ts"), createFilePath("foo"))     // => true
 * isChildOf(createFilePath("foo/bar/baz.ts"), createFilePath("foo/bar")) // => true
 * isChildOf(createFilePath("foo/bar"), createFilePath("foo/bar"))        // => false (same path)
 */
export function isChildOf(child: FilePath, parent: FilePath): boolean {
	if (!parent) return child.length > 0 // Everything is child of root
	return child.startsWith(parent + '/')
}

/**
 * Check if a path is the root path (empty string).
 */
export function isRootPath(fp: FilePath): boolean {
	return fp === ''
}

/**
 * Type guard to check if a string is a valid FilePath.
 * Note: This only checks the type, not if the file exists.
 */
export function isFilePath(value: unknown): value is FilePath {
	return typeof value === 'string'
}

/**
 * Unsafe cast from string to FilePath.
 * Only use when you're certain the string is already normalized.
 * Prefer createFilePath() in most cases.
 */
export function unsafeAsFilePath(normalized: string): FilePath {
	return normalized as FilePath
}
