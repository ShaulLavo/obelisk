import { Bash, defineCommand } from 'just-bash'
import type { FsContext, FsDirTreeNode, GrepMatch } from '@repo/fs'
import { grepStream } from '@repo/fs'
import { VfsBashAdapter } from './VfsBashAdapter'
import type { ShellContext } from './commands'
import { IGNORED_SEGMENTS } from '../fs/config/constants'

export type JustBashAdapter = {
	exec: (
		command: string
	) => Promise<{ stdout: string; stderr: string; exitCode: number }>
	dispose: () => void
	getVfsAdapter: () => VfsBashAdapter | undefined
	getPrompt: () => string
	setOutputCallback: (cb: ((text: string) => void) | null) => void
}

// ANSI color codes for rg output
const ANSI_CYAN = '\x1b[36m'
const ANSI_YELLOW = '\x1b[33m'
const ANSI_RESET = '\x1b[0m'
const MAX_LINE_LENGTH = 200

function formatGrepMatch(match: GrepMatch): string {
	const { path, lineNumber, lineContent } = match
	let displayContent = lineContent
	if (lineContent.length > MAX_LINE_LENGTH) {
		displayContent = lineContent.slice(0, MAX_LINE_LENGTH) + '...'
	}
	return `${ANSI_CYAN}${path}${ANSI_RESET}:${ANSI_YELLOW}${lineNumber}${ANSI_RESET}: ${displayContent}`
}

export function createJustBashAdapter(
	fsContext?: FsContext,
	tree?: FsDirTreeNode,
	shellContext?: ShellContext
): JustBashAdapter {
	const vfsAdapter = fsContext ? new VfsBashAdapter(fsContext, tree) : undefined
	const state = { outputCallback: null as ((text: string) => void) | null }

	// Define custom commands
	const customCommands = [
		// open: Open file in editor
		defineCommand('open', async (args, ctx) => {
			if (!shellContext) {
				return {
					stdout: '',
					stderr: 'open: shell not available\n',
					exitCode: 1,
				}
			}
			const path = args[0]
			if (!path) {
				return { stdout: '', stderr: 'usage: open <file>\n', exitCode: 1 }
			}

			// Resolve absolute path in VFS
			// Note: ctx.fs is our VfsBashAdapter which implements resolvePath
			const resolved = ctx.fs.resolvePath(ctx.cwd, path)

			// Check if file exists
			try {
				await ctx.fs.stat(resolved)
			} catch {
				return {
					stdout: '',
					stderr: `open: ${path}: No such file or directory\n`,
					exitCode: 1,
				}
			}

			// Strip leading slash for VFS action
			// just-bash uses absolute paths (/file), but app expects relative (file)
			const target = resolved.startsWith('/') ? resolved.slice(1) : resolved

			try {
				await shellContext.actions.selectPath(target, { forceReload: true })
				return { stdout: `Opened ${target}\n`, stderr: '', exitCode: 0 }
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err)
				return { stdout: '', stderr: `open: ${message}\n`, exitCode: 1 }
			}
		}),

		// wg: Fast worker-based grep
		defineCommand('wg', async (args, ctx) => {
			if (!fsContext) {
				return {
					stdout: '',
					stderr: 'wg: filesystem not available\n',
					exitCode: 1,
				}
			}

			// Parse args
			let pattern: string | null = null
			const searchPaths: string[] = []

			// Options
			let maxResults: number | null = null
			let noIgnore = false
			let caseInsensitive = false
			let smartCase = false
			let wordRegexp = false
			let invertMatch = false
			let count = false
			let filesWithMatches = false
			let filesWithoutMatch = false
			let onlyMatching = false
			let maxColumns: number | null = null

			let context: number | null = null
			let contextBefore: number | null = null
			let contextAfter: number | null = null

			const excludePatterns: string[] = []
			const includePatterns: string[] = []

			let fileType: string | null = null
			let fileTypeNot: string | null = null

			let showHelp = false

			let i = 0
			while (i < args.length) {
				const arg = args[i]!

				if (arg === '-h' || arg === '--help') {
					showHelp = true
					i++
				}
				// Output control
				else if (arg === '-n' || arg === '--max-count') {
					const val = args[++i]
					if (val) maxResults = parseInt(val, 10)
				} else if (arg === '-c' || arg === '--count') {
					count = true
					i++
				} else if (arg === '-l' || arg === '--files-with-matches') {
					filesWithMatches = true
					i++
				} else if (arg === '--files-without-match') {
					filesWithoutMatch = true
					i++
				} else if (arg === '-o' || arg === '--only-matching') {
					onlyMatching = true
					i++
				} else if (arg === '-M' || arg === '--max-columns') {
					const val = args[++i]
					if (val) maxColumns = parseInt(val, 10)
				}

				// Search modifiers
				else if (arg === '-i' || arg === '--ignore-case') {
					caseInsensitive = true
					i++
				} else if (arg === '-S' || arg === '--smart-case') {
					smartCase = true
					i++
				} else if (arg === '-w' || arg === '--word-regexp') {
					wordRegexp = true
					i++
				} else if (arg === '-v' || arg === '--invert-match') {
					invertMatch = true
					i++
				} else if (arg === '-F' || arg === '--fixed-strings') {
					// Default, just consume
					i++
				}

				// Filtering
				else if (arg === '--no-ignore' || arg === '-u') {
					noIgnore = true
					i++
				} else if (arg === '-g' || arg === '--glob') {
					const val = args[++i]
					if (val) {
						if (val.startsWith('!')) {
							excludePatterns.push(val.slice(1))
						} else {
							includePatterns.push(val)
						}
					}
				} else if (arg === '-t' || arg === '--type') {
					fileType = args[++i] ?? null
				} else if (arg === '-T' || arg === '--type-not') {
					fileTypeNot = args[++i] ?? null
				} else if (arg === '-.' || arg === '--hidden') {
					noIgnore = true // Treat broadly as include hidden
					i++
				}

				// Context
				else if (arg === '-C' || arg === '--context') {
					const val = args[++i]
					if (val) context = parseInt(val, 10)
				} else if (arg === '-B' || arg === '--before-context') {
					const val = args[++i]
					if (val) contextBefore = parseInt(val, 10)
				} else if (arg === '-A' || arg === '--after-context') {
					const val = args[++i]
					if (val) contextAfter = parseInt(val, 10)
				}

				// Positional
				else if (arg.startsWith('-')) {
					return {
						stdout: '',
						stderr: `wg: unknown option: ${arg}\n`,
						exitCode: 1,
					}
				} else {
					if (pattern === null) {
						pattern = arg
					} else {
						searchPaths.push(arg)
					}
					i++
				}
			}

			if (showHelp) {
				return {
					stdout: [
						'wg - fast worker-based grep',
						'',
						'USAGE: wg [OPTIONS] <PATTERN> [PATH...]',
						'',
						'OPTIONS:',
						'  -i, --ignore-case      Case insensitive',
						'  -S, --smart-case       Smart case',
						'  -w, --word-regexp      Word boundaries',
						'  -v, --invert-match     Invert match',
						'  -c, --count            Count matches',
						'  -l, --files-with-matches  Print filenames only',
						'  -o, --only-matching    Print only matched text',
						'  -C, --context NUM      Context lines',
						'  -g, --glob GLOB        Include/exclude glob',
						'  -t, --type TYPE        File type (ts, js, json, css...)',
						'  -n, --max-count NUM    Max results',
						'  -u, --no-ignore        Include ignored/hidden files',
						'',
					].join('\n'),
					stderr: '',
					exitCode: 0,
				}
			}

			if (!pattern) {
				return {
					stdout: '',
					stderr: 'wg: missing pattern\nUsage: wg [options] <pattern> [path]\n',
					exitCode: 1,
				}
			}

			// Resolve search paths
			const cwd = ctx.cwd.startsWith('/') ? ctx.cwd.slice(1) : ctx.cwd
			const resolvedPaths =
				searchPaths.length > 0
					? searchPaths.map((p) => {
							// Resolve path relative to CWD
							const r = ctx.fs.resolvePath(ctx.cwd, p)
							return r.startsWith('/') ? r.slice(1) : r
						})
					: [cwd || ''] // Default to CWD

			try {
				const ignores = noIgnore ? [] : Array.from(IGNORED_SEGMENTS)
				// Merge manual excludes
				ignores.push(...excludePatterns)

				const generator = grepStream(fsContext, pattern, {
					paths: resolvedPaths,
					excludePatterns: ignores,
					includePatterns,
					maxResults: maxResults ?? undefined,
					includeHidden: noIgnore,

					// New options
					caseInsensitive,
					smartCase,
					wordRegexp,
					invertMatch,
					count,
					filesWithMatches,
					filesWithoutMatch,
					onlyMatching,
					maxColumnsPreview: maxColumns ?? undefined,
					context: context ?? undefined,
					contextBefore: contextBefore ?? undefined,
					contextAfter: contextAfter ?? undefined,
					type: fileType ?? undefined,
					typeNot: fileTypeNot ?? undefined,
				})

				let output = ''
				let matchFound = false

				for await (const result of generator) {
					matchFound = true

					let line = ''
					if (count) {
						const cnt = result.matchCount ?? result.matches.length
						if (cnt > 0) {
							line = `${result.path}:${cnt}\n`
						}
					} else if (filesWithMatches || filesWithoutMatch) {
						line = `${result.path}\n`
					} else {
						for (const m of result.matches) {
							line += formatGrepMatch(m) + '\n'
						}
					}

					if (line) {
						if (state.outputCallback) {
							state.outputCallback(line)
						} else {
							output += line
						}
					}

					if (output.length > 5 * 1024 * 1024) {
						const msg = `... truncated (too much output)\n`
						if (state.outputCallback) {
							state.outputCallback(msg)
						} else {
							output += msg
						}
						break
					}
				}

				if (!matchFound && !filesWithoutMatch) {
					return { stdout: '', stderr: '', exitCode: 1 }
				}

				return { stdout: output, stderr: '', exitCode: 0 }
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err)
				return {
					stdout: '',
					stderr: `wg: ${message}\n`,
					exitCode: 1,
				}
			}
		}),
	]
	// Alias code to open
	customCommands.push({
		...customCommands[0]!,
		name: 'code',
	})

	const bash = new Bash({
		fs: vfsAdapter,
		cwd: '/',
		customCommands,
	})

	// Maintain persistent state since Bash class is stateless
	let currentCwd = '/'
	let currentEnv: Record<string, string> = {
		PS1: '\\w $ ',
	}

	return {
		exec: async (cmd: string) => {
			const result = await bash.exec(cmd, {
				cwd: currentCwd,
				env: currentEnv,
				onOutput: state.outputCallback
					? (text: string) => state.outputCallback!(text) // wrapper needed because state is enclosed
					: undefined,
			})

			if (result.env) {
				currentEnv = result.env
				if (result.env.PWD) {
					currentCwd = result.env.PWD
				}
			}

			return result
		},
		dispose: () => {},
		getVfsAdapter: () => vfsAdapter,
		getPrompt: () => {
			const ps1 = currentEnv['PS1'] || '$ '
			const cwd =
				currentCwd === '/'
					? '/'
					: currentCwd.replace(/^\/home\/user/, '') || '/'
			return ps1.replace('\\w', cwd)
		},
		setOutputCallback: (cb: ((text: string) => void) | null) => {
			state.outputCallback = cb
		},
	}
}
