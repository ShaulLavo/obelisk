import { FitAddon as XtermFitAddon } from '@xterm/addon-fit'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import {
	Terminal as GhosttyTerminal,
	init,
	FitAddon as GhosttyFitAddon,
	type CanvasRenderer,
} from 'ghostty-web'
import { LocalEchoController } from './localEcho'
import { createJustBashAdapter } from './justBashAdapter'
import type { ShellContext } from './commands'
import type { TerminalPrompt } from './prompt'
import type { TerminalAddonLike, TerminalLike } from './localEcho/types'
import type { ThemePalette } from '@repo/theme'

export type TerminalBackend = 'ghostty' | 'xterm'

export type TerminalController = Awaited<
	ReturnType<typeof createTerminalController>
>

type FitAddonLike = TerminalAddonLike & {
	fit: () => void
	observeResize?: () => void
}

type TerminalRuntime = {
	term: TerminalLike
	fitAddon: FitAddonLike
	setTheme: (theme: ThemePalette) => void
	remeasureRendererFont?: () => void
}

type TerminalControllerOptions = {
	getPrompt: () => TerminalPrompt
	/** Shell context for future VFS integration. Currently unused with just-bash. */
	shellContext?: ShellContext
	theme: ThemePalette
	/** Whether to focus the terminal on mount. Default: true */
	focusOnMount?: boolean
	backend?: TerminalBackend
}

const FONT_FAMILY = 'JetBrains Mono Variable, monospace'
const FONT_SIZE = 14

export const createTerminalController = async (
	container: HTMLDivElement,
	options: TerminalControllerOptions
) => {
	let disposed = false
	let initialFitRaf: number | null = null

	const backend = options.backend ?? 'ghostty'
	const runtime =
		backend === 'xterm'
			? createXtermRuntime(options.theme)
			: await createGhosttyRuntime(options.theme)

	const { term, fitAddon, remeasureRendererFont, setTheme } = runtime
	const echoAddon = new LocalEchoController({
		outputMode: backend === 'ghostty' ? 'strict' : 'none',
	})

	term.loadAddon(fitAddon)
	term.loadAddon(echoAddon)

	// Create bash adapter with VFS if shell context is available
	const bashAdapter = await (async () => {
		if (options.shellContext) {
			const fsContext = await options.shellContext.getVfsContext()
			const tree = options.shellContext.state.tree ?? undefined
			return createJustBashAdapter(fsContext, tree, options.shellContext)
		}
		return createJustBashAdapter()
	})()

	const startPromptLoop = async () => {
		while (!disposed) {
			const prompt = bashAdapter.getPrompt()
			try {
				const input = await echoAddon.read(prompt)
				bashAdapter.setOutputCallback((text) => echoAddon.print(text))
				const result = await bashAdapter.exec(input)
				bashAdapter.setOutputCallback(null)
				if (result.stdout) echoAddon.print(result.stdout)
				if (result.stderr) echoAddon.print(result.stderr)
			} catch {
				bashAdapter.setOutputCallback(null)
				break
			}
		}
	}

	const fit = () => {
		if (!disposed) fitAddon.fit()
	}
	const handleResize = () => {
		remeasureRendererFont?.()
		fit()
	}

	const viewport = typeof window !== 'undefined' ? window.visualViewport : null
	const handleViewportResize = () => handleResize()

	term.open(container)
	remeasureRendererFont?.()
	fitAddon.observeResize?.()
	{
		initialFitRaf = requestAnimationFrame(() => {
			fit()
			initialFitRaf = requestAnimationFrame(() => {
				fit()
				initialFitRaf = null
			})
		})
	}
	if (options.focusOnMount !== false) {
		term.focus()
	}

	echoAddon.println('Welcome to vibe shell (powered by just-bash)')
	echoAddon.println('Type `help` to see available commands.')
	window.addEventListener('resize', handleResize)
	viewport?.addEventListener('resize', handleViewportResize)
	void startPromptLoop()

	return {
		fit,
		setTheme: (theme: ThemePalette) => {
			setTheme(theme)
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
			fitAddon.dispose()
			bashAdapter.dispose()
			term.dispose()
		},
	}
}

const createGhosttyRuntime = async (
	theme: ThemePalette
): Promise<TerminalRuntime> => {
	try {
		await init()
	} catch (error) {
		console.error('Failed to initialize terminal', error)
		throw new Error('terminal initialization failed', { cause: error })
	}

	const term = new GhosttyTerminal({
		scrollback: 0,
		convertEol: true,
		cursorBlink: true,
		fontSize: FONT_SIZE,
		fontFamily: FONT_FAMILY,
		theme: {
			...mapTheme(theme),
		},
	})

	return {
		term,
		fitAddon: new GhosttyFitAddon(),
		setTheme: (next) => {
			term.options.theme = mapTheme(next)
		},
		remeasureRendererFont: () => {
			const renderer = term.renderer as CanvasRenderer | undefined
			renderer?.remeasureFont()
		},
	}
}

const createXtermRuntime = (theme: ThemePalette): TerminalRuntime => {
	const term = new XtermTerminal({
		scrollback: 0,
		convertEol: true,
		cursorBlink: true,
		fontSize: FONT_SIZE,
		fontFamily: FONT_FAMILY,
		theme: {
			...mapTheme(theme),
		},
	})

	return {
		term,
		fitAddon: new XtermFitAddon(),
		setTheme: (next) => {
			term.options.theme = mapTheme(next)
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
