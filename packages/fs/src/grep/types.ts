/**
 * Browser Grep - Type Definitions
 *
 * High-performance, streaming, byte-level grep for the browser.
 */

// ============================================================================
// Search Configuration
// ============================================================================

export interface GrepOptions {
	/** Literal search string (no regex) */
	pattern: string

	/** Paths to search (default: root) */
	paths?: string[]

	/** Stop after N matches (default: unlimited) */
	maxResults?: number

	/** Include dotfiles (default: false) */
	includeHidden?: boolean

	/** Glob patterns to exclude (e.g., ['node_modules', '*.min.js']) */
	excludePatterns?: string[]

	/** Chunk size for streaming reads (default: 512KB) */
	chunkSize?: number

	/** Number of workers (default: min(cores - 1, 6)) */
	workerCount?: number

	/** Case-insensitive search (default: false) - FUTURE */
	// caseSensitive?: boolean
}

// ============================================================================
// Results
// ============================================================================

/** Single match result */
export interface GrepMatch {
	/** Relative file path */
	path: string

	/** 1-indexed line number */
	lineNumber: number

	/** Decoded line text (trimmed) */
	lineContent: string

	/** 0-indexed column offset of match within line */
	matchStart: number
}

/** Aggregated result from searching a single file */
export interface GrepFileResult {
	/** File path */
	path: string

	/** All matches found in this file */
	matches: GrepMatch[]

	/** Total bytes scanned */
	bytesScanned: number

	/** Error if file couldn't be read */
	error?: string
}

// ============================================================================
// Worker Communication
// ============================================================================

/** Task sent to a worker to grep a single file */
export interface GrepFileTask {
	/** File handle to search */
	fileHandle: FileSystemFileHandle

	/** Relative path for result reporting */
	path: string

	/** Search pattern as UTF-8 bytes */
	patternBytes: Uint8Array

	/** Chunk size for streaming */
	chunkSize: number
}

/** Batch of tasks for a worker */
export interface GrepBatchTask {
	tasks: GrepFileTask[]
}

/** Result from worker for a batch of files */
export interface GrepBatchResult {
	results: GrepFileResult[]
}

// ============================================================================
// Progress & Callbacks
// ============================================================================

export interface GrepProgress {
	/** Number of files scanned so far */
	filesScanned: number

	/** Total number of files to scan */
	filesTotal: number

	/** Number of matches found so far */
	matchesFound: number

	/** Current file being scanned (optional) */
	currentFile?: string
}

export type GrepProgressCallback = (progress: GrepProgress) => void

// ============================================================================
// Internal Types
// ============================================================================

/** Extracted line information from a match */
export interface LineInfo {
	/** 1-indexed line number */
	lineNumber: number

	/** Decoded line content */
	lineContent: string

	/** Column offset of match within line */
	columnOffset: number
}

/** Chunk with metadata for streaming */
export interface ChunkData {
	/** Raw bytes */
	chunk: Uint8Array

	/** Absolute byte offset in file */
	absoluteOffset: number

	/** Whether this is the last chunk */
	isLast: boolean
}
