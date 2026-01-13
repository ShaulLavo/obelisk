/**
 * Uneditable Files Configuration
 *
 * Central registry of file paths that should be read-only in the editor.
 * These files are system files that users should not modify directly.
 */

import { createFilePath } from '@repo/fs'

/** Paths that are uneditable (normalized without leading slash) */
const UNEDITABLE_PATHS = new Set<string>([
	'.system/defaultSettings.json',
])

/** Path patterns (globs) that match uneditable files */
const UNEDITABLE_PATTERNS: RegExp[] = [
	// Example: /^\.system\/generated\/.*/
]

/**
 * Check if a file path is uneditable
 */
export function isUneditablePath(path: string): boolean {
	const normalized = createFilePath(path)

	// Check exact paths
	if (UNEDITABLE_PATHS.has(normalized)) {
		return true
	}

	// Check patterns
	for (const pattern of UNEDITABLE_PATTERNS) {
		if (pattern.test(normalized)) {
			return true
		}
	}

	return false
}

/**
 * Get all uneditable paths (for debugging/display)
 */
export function getUneditablePaths(): string[] {
	return Array.from(UNEDITABLE_PATHS)
}

/**
 * Add a path to the uneditable set (for runtime additions)
 */
export function addUneditablePath(path: string): void {
	UNEDITABLE_PATHS.add(createFilePath(path))
}

/**
 * Remove a path from the uneditable set
 */
export function removeUneditablePath(path: string): void {
	UNEDITABLE_PATHS.delete(createFilePath(path))
}
