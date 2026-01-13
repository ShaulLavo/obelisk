import type { CommandContext } from '../commands'
import type { GrepMatch, GrepProgress } from '@repo/fs'
import { grep, createFilePath } from '@repo/fs'
import { DEFERRED_SEGMENTS } from '../../fs/config/constants'
import { readFileText } from '../../fs/runtime/streaming'
import { DEFAULT_SOURCE } from '../../fs/config/constants'

/**
 * Parsed grep command arguments
 */
export interface GrepCommandArgs {
	/** Search pattern (literal string) */
	pattern: string | null
	/** Search path relative to CWD */
	path: string | null
	/** Maximum number of results to return */
	maxResults: number | null
	/** Glob patterns to exclude from search */
	excludePatterns: string[]
	/** Whether to show help text */
	showHelp: boolean
	/** Whether to disable default exclusions (search everywhere) */
	noExclude: boolean
}

/**
 * Parse grep command arguments
 *
 * Supports:
 * - grep <pattern> [path]
 * - grep -n <number> <pattern> [path]
 * - grep --exclude <pattern> <pattern> [path]
 * - grep --no-exclude <pattern> [path]
 * - grep -h / --help
 *
 * @param args - Raw command arguments
 * @returns Parsed arguments object
 */
export function parseGrepArgs(args: string[]): GrepCommandArgs {
	const result: GrepCommandArgs = {
		pattern: null,
		path: null,
		maxResults: null,
		excludePatterns: [],
		showHelp: false,
		noExclude: false,
	}

	const positional: string[] = []
	let i = 0

	while (i < args.length) {
		const arg = args[i]

		if (arg === '-h' || arg === '--help') {
			result.showHelp = true
			i++
		} else if (arg === '-n') {
			i++
			if (i < args.length) {
				const numStr = args[i]
				if (numStr) {
					const num = Number.parseInt(numStr, 10)
					if (!Number.isNaN(num) && num > 0) {
						result.maxResults = num
					}
				}
			}
			i++
		} else if (arg === '--exclude') {
			i++
			if (i < args.length) {
				const pattern = args[i]
				if (pattern) {
					result.excludePatterns.push(pattern)
				}
			}
			i++
		} else if (arg === '--no-exclude') {
			result.noExclude = true
			i++
		} else {
			if (arg) {
				positional.push(arg)
			}
			i++
		}
	}

	if (positional.length > 0) {
		let pattern = positional[0] ?? null
		if (
			pattern &&
			pattern.length >= 2 &&
			((pattern.startsWith('"') && pattern.endsWith('"')) ||
				(pattern.startsWith("'") && pattern.endsWith("'")))
		) {
			pattern = pattern.slice(1, -1)
		}
		result.pattern = pattern
	}
	if (positional.length > 1) {
		let path = positional[1] ?? null
		if (
			path &&
			path.length >= 2 &&
			((path.startsWith('"') && path.endsWith('"')) ||
				(path.startsWith("'") && path.endsWith("'")))
		) {
			path = path.slice(1, -1)
		}
		result.path = path
	}

	return result
}

/**
 * Parse .gitignore file content into array of glob patterns
 *
 * Handles:
 * - Comments (lines starting with #)
 * - Negation patterns (lines starting with !)
 * - Blank lines
 *
 * @param content - Raw .gitignore file content
 * @returns Array of glob patterns to exclude
 */
export function parseGitignore(content: string): string[] {
	const patterns: string[] = []
	const lines = content.split('\n')

	for (const line of lines) {
		const trimmed = line.trim()

		if (!trimmed) continue
		if (trimmed.startsWith('#')) continue

		patterns.push(trimmed)
	}

	return patterns
}

/**
 * Load gitignore patterns from a .gitignore file in the search path
 *
 * @param ctx - Command context with shell access
 * @param searchPath - Path to search for .gitignore file
 * @returns Array of glob patterns from .gitignore, or empty array if file doesn't exist
 */
export async function loadGitignorePatterns(
	ctx: CommandContext,
	searchPath: string
): Promise<string[]> {
	const gitignorePath = searchPath ? `${searchPath}/.gitignore` : '.gitignore'
	if (!ctx.shell.state.tree) return []

	const node = ctx.shell.state.pathIndex[createFilePath(gitignorePath)]
	if (!node || node.kind !== 'file') {
		return []
	}

	try {
		const source = ctx.shell.state.activeSource ?? DEFAULT_SOURCE
		const content = await readFileText(source, gitignorePath)
		return parseGitignore(content)
	} catch {
		return []
	}
}

const ANSI_CYAN = '\x1b[36m'
const ANSI_YELLOW = '\x1b[33m'
const ANSI_RESET = '\x1b[0m'
const MAX_LINE_LENGTH = 200
const DISPLAY_ROOT = '/'
const TRUNCATION_INDICATOR = '...'

/**
 * Format a grep match for terminal display
 *
 * Formats as: <path>:<lineNumber>: <lineContent>
 * With ANSI color codes:
 * - Path: Cyan
 * - Line number: Yellow
 * - Line content: Default (reset)
 *
 * Lines exceeding MAX_LINE_LENGTH are truncated with indicator.
 *
 * @param match - Grep match to format
 * @param maxLineLength - Maximum line length before truncation (default: 200)
 * @returns Formatted string with ANSI color codes
 */
export function formatGrepMatch(
	match: GrepMatch,
	maxLineLength: number = MAX_LINE_LENGTH
): string {
	const { path, lineNumber, lineContent } = match
	let displayContent = lineContent
	if (lineContent.length > maxLineLength) {
		displayContent = lineContent.slice(0, maxLineLength) + TRUNCATION_INDICATOR
	}
	return `${ANSI_CYAN}${path}${ANSI_RESET}:${ANSI_YELLOW}${lineNumber}${ANSI_RESET}: ${displayContent}`
}

/**
 * Format progress update for terminal display
 *
 * Formats as: Searching... <filesScanned>/<filesTotal> files, <matchesFound> matches
 *
 * @param progress - Grep progress object
 * @returns Formatted progress string
 */
export function formatProgress(progress: GrepProgress): string {
	const { filesScanned, filesTotal, matchesFound } = progress
	return `Searching... ${filesScanned}/${filesTotal} files, ${matchesFound} matches`
}

/**
 * Format completion summary for terminal display
 *
 * Formats as: Found <matchesFound> matches (searched <filesScanned> files)
 *
 * @param progress - Final grep progress object
 * @returns Formatted summary string
 */
export function formatSummary(progress: GrepProgress): string {
	const { filesScanned, matchesFound } = progress
	const matchWord = matchesFound === 1 ? 'match' : 'matches'
	const fileWord = filesScanned === 1 ? 'file' : 'files'
	return `Found ${matchesFound} ${matchWord} (searched ${filesScanned} ${fileWord})`
}

/**
 * Normalize a path relative to CWD
 *
 * @param cwd - Current working directory
 * @param input - Input path (can be relative or absolute)
 * @returns Normalized path
 */
function normalizePath(cwd: string, input: string): string {
	const trimmed = input.trim()
	if (!trimmed || trimmed === '.') return cwd
	if (trimmed === DISPLAY_ROOT) return ''

	const base = trimmed.startsWith(DISPLAY_ROOT) ? '' : cwd
	const combined = [base, trimmed].filter(Boolean).join(DISPLAY_ROOT)
	const segments = combined.split(DISPLAY_ROOT).filter(Boolean)

	const stack: string[] = []
	for (const segment of segments) {
		if (segment === '.') continue
		if (segment === '..') {
			if (stack.length === 0) {
				throw new Error('Path escapes root')
			}
			stack.pop()
			continue
		}
		stack.push(segment)
	}

	return stack.join(DISPLAY_ROOT)
}

/**
 * Print grep help text
 *
 * @param ctx - Command context
 */
function printGrepHelp(ctx: CommandContext): void {
	ctx.localEcho?.println('Usage: grep [options] <pattern> [path]')
	ctx.localEcho?.println('')
	ctx.localEcho?.println('Search for a literal text pattern in files.')
	ctx.localEcho?.println('')
	ctx.localEcho?.println('Options:')
	ctx.localEcho?.println('  -n <number>         Limit results to N matches')
	ctx.localEcho?.println(
		'  --exclude <pattern> Exclude files/dirs matching pattern (can be repeated)'
	)
	ctx.localEcho?.println(
		'  --no-exclude        Disable default exclusions (search everywhere)'
	)
	ctx.localEcho?.println('  -h, --help          Show this help text')
	ctx.localEcho?.println('')
	ctx.localEcho?.println('Examples:')
	ctx.localEcho?.println(
		'  grep TODO                    # Search for "TODO" in current directory'
	)
	ctx.localEcho?.println(
		'  grep "import React" src      # Search in src directory'
	)
	ctx.localEcho?.println('  grep -n 10 console.log       # Limit to 10 results')
	ctx.localEcho?.println(
		'  grep --exclude "*.test.ts" bug  # Exclude test files'
	)
	ctx.localEcho?.println(
		'  grep --no-exclude console.log   # Search everywhere (including node_modules)'
	)
}

/**
 * Main grep command handler
 *
 * @param ctx - Command context with terminal and shell access
 * @param args - Raw command arguments
 */
export async function handleGrep(
	ctx: CommandContext,
	args: string[]
): Promise<void> {
	const parsed = parseGrepArgs(args)

	if (parsed.showHelp) {
		printGrepHelp(ctx)
		return
	}

	if (!parsed.pattern) {
		ctx.localEcho?.println('grep: missing pattern')
		ctx.localEcho?.println('Usage: grep [options] <pattern> [path]')
		ctx.localEcho?.println('Try "grep --help" for more information.')
		return
	}

	if (!ctx.shell.state.tree) {
		ctx.localEcho?.println('Filesystem not ready. Try again in a moment.')
		return
	}

	const cwd = ctx.shell.getCwd()
	const searchPath = parsed.path ? normalizePath(cwd, parsed.path) : cwd

	const searchNode = ctx.shell.state.pathIndex[createFilePath(searchPath)]
	if (!searchNode) {
		ctx.localEcho?.println(
			`grep: ${searchPath || '/'}: No such file or directory`
		)
		return
	}

	try {
		const vfsContext = await ctx.shell.getVfsContext()
		const gitignorePatterns = parsed.noExclude
			? []
			: await loadGitignorePatterns(ctx, searchPath)

		const excludePatterns = [
			...(parsed.noExclude ? [] : Array.from(DEFERRED_SEGMENTS)),
			...gitignorePatterns,
			...parsed.excludePatterns,
		]

		let lastProgress: GrepProgress | null = null
		let matchCount = 0
		let resultsTruncated = false

		const matches = await grep(
			vfsContext,
			parsed.pattern,
			{
				paths: [searchPath],
				excludePatterns,
				maxResults: parsed.maxResults ?? undefined,
				includeHidden: parsed.noExclude,
			},
			(progress) => {
				lastProgress = progress
				ctx.localEcho?.print(`\r${formatProgress(progress)}`)
			}
		)

		if (lastProgress) {
			ctx.localEcho?.print('\r\x1b[K')
		}

		if (parsed.maxResults && matches.length >= parsed.maxResults) {
			resultsTruncated = true
		}

		for (const match of matches) {
			ctx.localEcho?.println(formatGrepMatch(match))
			matchCount++
		}

		if (matchCount === 0) {
			ctx.localEcho?.println('No matches found')
		} else {
			if (lastProgress) {
				ctx.localEcho?.println(formatSummary(lastProgress))
			}
			if (resultsTruncated) {
				ctx.localEcho?.println(`(results limited to ${parsed.maxResults})`)
			}
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unexpected error during grep'
		ctx.localEcho?.println(`grep: ${message}`)
	}
}
