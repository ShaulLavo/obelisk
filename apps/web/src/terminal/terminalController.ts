// import { FitAddon } from '@xterm/addon-fit'
import {
	Terminal as Ghostty,
	init,
	FitAddon,
	type CanvasRenderer,
} from 'ghostty-web'
import { LocalEchoController } from './localEcho'
import { handleCommand, type CommandContext } from './commands'
import type { TerminalPrompt } from './prompt'
import type { ThemePalette } from '@repo/theme'

export type TerminalController = Awaited<
	ReturnType<typeof createTerminalController>
>

type TerminalControllerOptions = {
	getPrompt: () => TerminalPrompt
	commandContext: Omit<CommandContext, 'localEcho' | 'term'>
	theme: ThemePalette
	/** Whether to focus the terminal on mount. Default: true */
	focusOnMount?: boolean
}

export const createTerminalController = async (
	container: HTMLDivElement,
	options: TerminalControllerOptions
) => {
	let disposed = false
	let initialFitRaf: number | null = null

	try {
		await init()
	} catch (error) {
		console.error('Failed to initialize terminal', error)
		throw new Error('terminal initialization failed', { cause: error })
	}
	const term = new Ghostty({
		convertEol: true,
		cursorBlink: true,
		fontSize: 14,
		fontFamily: 'JetBrains Mono Variable, monospace',
		theme: {
			...mapTheme(options.theme),
		},
	})

	const fitAddon = new FitAddon()
	const echoAddon = new LocalEchoController()

	term.loadAddon(fitAddon)
	term.loadAddon(echoAddon)

	const remeasureRendererFont = () => {
		const renderer = term.renderer as CanvasRenderer | undefined
		renderer?.remeasureFont()
	}

	const startPromptLoop = async () => {
		while (!disposed) {
			const { label, continuation } = options.getPrompt()
			try {
				const input = await echoAddon.read(label, continuation)
				await handleCommand(input, {
					localEcho: echoAddon,
					term,
					...options.commandContext,
				})
			} catch {
				break
			}
		}
	}

	const fit = () => {
		if (!disposed) fitAddon.fit()
	}
	const handleResize = () => {
		remeasureRendererFont()
		fit()
	}

	const viewport = typeof window !== 'undefined' ? window.visualViewport : null
	const handleViewportResize = () => handleResize()

	term.open(container)
	remeasureRendererFont()
	{
		const observeResize = fitAddon.observeResize
		observeResize.call(fitAddon)

		initialFitRaf = requestAnimationFrame(() => {
			fit()
			// 2nd pass to catch late layout/font metric settling
			initialFitRaf = requestAnimationFrame(() => {
				fit()
				initialFitRaf = null
			})
		})
	}
	if (options.focusOnMount !== false) {
		term.focus()
	}

	echoAddon.println('Welcome to vibe shell')
	echoAddon.println('Type `help` to see available commands.')
	window.addEventListener('resize', handleResize)
	viewport?.addEventListener('resize', handleViewportResize)
	void startPromptLoop()

	return {
		fit,
		setTheme: (theme: ThemePalette) => {
			term.options.theme = mapTheme(theme)
		},
		dispose: () => {
			disposed = true
			if (initialFitRaf !== null) {
				cancelAnimationFrame(initialFitRaf)
				initialFitRaf = null
			}
			window.removeEventListener('resize', handleResize)
			viewport?.removeEventListener('resize', handleViewportResize)
			echoAddon.abortRead('terminal disposed')
			echoAddon.dispose()
			term.dispose()
		},
	}
}

function mapTheme(theme: ThemePalette) {
	return {
		background: theme.terminal.background,
		foreground: theme.terminal.foreground,
		black: theme.terminal.black,
		red: theme.terminal.red,
		green: theme.terminal.green,
		yellow: theme.terminal.yellow,
		blue: theme.terminal.blue,
		magenta: theme.terminal.magenta,
		cyan: theme.terminal.cyan,
		white: theme.terminal.white,
		cursor: theme.terminal.cursor,
		brightBlack: theme.terminal.brightBlack,
		brightRed: theme.terminal.brightRed,
		brightGreen: theme.terminal.brightGreen,
		brightYellow: theme.terminal.brightYellow,
		brightBlue: theme.terminal.brightBlue,
		brightMagenta: theme.terminal.brightMagenta,
		brightCyan: theme.terminal.brightCyan,
		brightWhite: theme.terminal.brightWhite,
	}
}
