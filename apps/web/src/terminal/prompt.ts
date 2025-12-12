type Rgb = [number, number, number]

const promptUser = 'guest'
const promptHost = 'vibe'
const ROOT_PATH = '/'
const ANSI_RESET = '\x1b[0m'
const ANSI_DIM = '\x1b[2m'
const userColor: Rgb = [56, 189, 248] // sky-400
const hostColor: Rgb = [244, 114, 182] // pink-400
const pathColor: Rgb = [248, 180, 0] // amber-400
const sourceColor: Rgb = [94, 234, 212] // teal-300
const symbolColor: Rgb = [74, 222, 128] // green-400
const timestampColor: Rgb = [148, 163, 184] // slate-400

const formatTime = (timestamp: Date): string => {
	const hours = timestamp.getHours().toString().padStart(2, '0')
	const minutes = timestamp.getMinutes().toString().padStart(2, '0')
	const seconds = timestamp.getSeconds().toString().padStart(2, '0')
	return `${hours}:${minutes}:${seconds}`
}

export interface TerminalPrompt {
	label: string
	continuation: string
}

const formatPromptPath = (path: string) => {
	if (!path) return ROOT_PATH
	return path.startsWith('/') ? path : `${ROOT_PATH}${path}`
}

const colorCode = ([r, g, b]: Rgb) => `\x1b[38;2;${r};${g};${b}m`

const colorize = (rgb: Rgb, text: string) =>
	`${colorCode(rgb)}${text}${ANSI_RESET}`

const dimText = (text: string) => `${ANSI_DIM}${text}${ANSI_RESET}`

const dimColorize = (rgb: Rgb, text: string) =>
	`${ANSI_DIM}${colorCode(rgb)}${text}${ANSI_RESET}`

/**
 * Strips ANSI escape sequences and control characters from a string.
 * Prevents ANSI injection if path/sourceLabel inputs become untrusted.
 */
const stripControlChars = (text: string): string =>
	text
		.replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color/style codes
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // Remove control chars (except \t, \n, \r)

export const createPrompt = (
	path: string,
	sourceLabel?: string
): TerminalPrompt => {
	const safePath = stripControlChars(path)
	const safeSourceLabel = sourceLabel
		? stripControlChars(sourceLabel)
		: undefined

	const now = formatTime(new Date())
	const timestamp = dimColorize(timestampColor, `[${now}]`)
	const identity = `${colorize(userColor, promptUser)}${dimText('@')}${colorize(
		hostColor,
		promptHost
	)}`
	const location = `${dimText(':')}${colorize(pathColor, formatPromptPath(safePath))}`
	const source = safeSourceLabel
		? ` ${dimText('(')}${colorize(sourceColor, safeSourceLabel)}${dimText(')')}`
		: ''
	const symbol = colorize(symbolColor, '$')

	return {
		label: `${timestamp} ${identity}${location}${source} ${symbol} `,
		continuation: dimText('... ')
	}
}
