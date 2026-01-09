import { FitAddon as XtermFitAddon } from '@xterm/addon-fit'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import {
	Terminal as GhosttyTerminal,
	init,
	FitAddon as GhosttyFitAddon,
	type CanvasRenderer,
} from 'ghostty-web'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import { LocalEchoController } from './localEcho'
import { createJustBashAdapter } from './justBashAdapter'
import { getSharedBuffer } from './sharedBuffer'
import type { BufferEntry } from './sharedBuffer'
import type { ShellContext } from './commands'
import type { TerminalPrompt } from './prompt'
import type { TerminalAddonLike, TerminalLike } from './localEcho/types'
import type { ThemePalette } from '@repo/theme'
import type { ScrollbarSource } from '@repo/ui/useScrollbar'
import { logger } from '~/logger'

export type TerminalBackend = 'ghostty' | 'xterm'
export type XtermRenderer = 'webgl' | 'canvas' | 'dom'

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
	rendererType?: XtermRenderer
}

type ScrollTargets = {
	scrollElement: HTMLElement | null
	scrollSource: ScrollbarSource | null
}

const FONT_FAMILY = 'JetBrains Mono Variable, monospace'
const FONT_SIZE = 14
const GHOSTTY_SCROLLBACK_LINES = 10000
const GHOSTTY_REPLAY_LIMIT = 2 * 1024 * 1024
const GHOSTTY_SCROLLBAR_LINE_HEIGHT = 20
const XTERM_SCROLL_LOOKUP_ATTEMPTS = 8
const terminalLogger = logger.withTag('terminal')

export const createTerminalController = async (
	container: HTMLDivElement,
	options: TerminalControllerOptions
) => {
	let disposed = false
	let initialFitRaf: number | null = null
	let scrollElement: HTMLElement | null = null
	let scrollSource: ScrollbarSource | null = null
	let xtermScrollLookupRaf: number | null = null
	let xtermScrollLookupAttempts = 0
	let xtermScrollLookupWarned = false
	const scrollTargetListeners = new Set<(targets: ScrollTargets) => void>()

	const backend = options.backend ?? 'ghostty'
	const runtime =
		backend === 'xterm'
			? createXtermRuntime(options.theme, options.rendererType)
			: await createGhosttyRuntime(options.theme)

	const { term, fitAddon, remeasureRendererFont, setTheme } = runtime
	const echoAddon = new LocalEchoController({
		// Sanitize ANSI output for xterm too to prevent parser errors on invalid bytes.
		outputMode: 'ansi',
	})

	term.loadAddon(fitAddon)
	term.loadAddon(echoAddon)

	// Get shared buffer for persisting output across backend switches
	const sharedBuffer = getSharedBuffer()
	const replayEndSequence = sharedBuffer.getLastSequence()
	let isReplaying = true
	const pendingEntries: BufferEntry[] = []

	const logOutputError = (error: unknown) => {
		const details =
			error instanceof Error
				? { message: error.message, stack: error.stack }
				: { message: String(error) }
		terminalLogger.error('Terminal output failed', details)
	}
	const printEntry = (entry: BufferEntry) => {
		if (disposed) return
		try {
			if (entry.type === 'println') {
				echoAddon.println(entry.content)
			} else {
				echoAddon.print(entry.content)
			}
		} catch (error) {
			logOutputError(error)
		}
	}
	const recordOutput = (type: BufferEntry['type'], text: string) => {
		sharedBuffer.add(type, text)
	}
	const recordingPrint = (text: string) => recordOutput('print', text)
	const recordingPrintln = (text: string) => recordOutput('println', text)
	const recordPromptInput = (prompt: string, input: string) => {
		if (prompt) {
			sharedBuffer.add('print', prompt, 'history')
		}
		sharedBuffer.add('println', input, 'history')
	}
	const unsubscribeSharedBuffer = sharedBuffer.subscribe((entry) => {
		if (entry.source === 'history') return
		if (isReplaying) {
			if (entry.seq > replayEndSequence) {
				pendingEntries.push(entry)
			}
			return
		}
		printEntry(entry)
	})

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
			await echoAddon.flushOutput()
			const prompt = options.getPrompt()
			try {
				const input = await echoAddon.read(prompt.label, prompt.continuation)
				recordPromptInput(prompt.label, input)
				bashAdapter.setOutputCallback((text) => recordingPrint(text))
				const result = await bashAdapter.exec(input)
				bashAdapter.setOutputCallback(null)
				if (result.stdout) recordingPrint(result.stdout)
				if (result.stderr) recordingPrint(result.stderr)
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

	const notifyScrollTargets = () => {
		const targets: ScrollTargets = {
			scrollElement,
			scrollSource,
		}
		for (const listener of scrollTargetListeners) {
			listener(targets)
		}
	}

	const clearXtermScrollLookup = () => {
		if (xtermScrollLookupRaf === null) return
		cancelAnimationFrame(xtermScrollLookupRaf)
		xtermScrollLookupRaf = null
	}

	const updateXtermScrollElement = () => {
		scrollElement = container.querySelector(
			'.xterm-viewport'
		) as HTMLElement | null

		if (!scrollElement) {
			return false
		}

		scrollSource = createXtermScrollSource(
			term as XtermTerminal,
			() => scrollElement
		)
		notifyScrollTargets()
		return true
	}

	const scheduleXtermScrollLookup = () => {
		if (xtermScrollLookupRaf !== null) return

		const attemptLookup = () => {
			xtermScrollLookupRaf = null
			if (disposed || backend !== 'xterm') return

			if (updateXtermScrollElement()) {
				xtermScrollLookupAttempts = 0
				return
			}

			xtermScrollLookupAttempts += 1
			if (xtermScrollLookupAttempts < XTERM_SCROLL_LOOKUP_ATTEMPTS) {
				xtermScrollLookupRaf = requestAnimationFrame(attemptLookup)
				return
			}

			if (!xtermScrollLookupWarned) {
				xtermScrollLookupWarned = true
				terminalLogger.warn('xterm viewport not found for scrollbar')
			}
		}

		xtermScrollLookupRaf = requestAnimationFrame(attemptLookup)
	}

	const updateScrollTargets = () => {
		if (backend === 'xterm') {
			scrollSource = null
			if (!updateXtermScrollElement()) {
				scheduleXtermScrollLookup()
			}
			return
		}

		scrollElement = null
		scrollSource = createGhosttyScrollSource(term as GhosttyTerminal)
		notifyScrollTargets()
	}

	term.open(container)
	updateScrollTargets()
	remeasureRendererFont?.()
	fitAddon.observeResize?.()

	if (options.focusOnMount !== false) {
		term.focus()
	}

	// Do initial fit FIRST, then start content (sync for simplicity)
	fit()

	const replayBuffer = async () => {
		if (sharedBuffer.entries.length === 0) {
			recordingPrintln('Welcome to vibe shell (powered by just-bash)')
			recordingPrintln('Type `help` to see available commands.')
			return
		}

		terminalLogger.debug('Replaying terminal buffer', {
			backend,
			entries: sharedBuffer.entries.length,
			size: sharedBuffer.getTotalSize(),
		})
		// For ghostty, reset terminal to get a clean slate
		// (ghostty may have garbage in WASM memory from previous use)
		if (backend === 'ghostty' && 'reset' in term) {
			;(term as { reset: () => void }).reset()
		}
		// Workaround: Ghostty WASM crashes on large replays, so cap replay size.
		const maxReplaySize =
			backend === 'ghostty' ? GHOSTTY_REPLAY_LIMIT : undefined
		if (maxReplaySize && sharedBuffer.getTotalSize() > maxReplaySize) {
			terminalLogger.warn('Capping terminal replay for Ghostty', {
				totalSize: sharedBuffer.getTotalSize(),
				replayLimit: maxReplaySize,
			})
		}
		await sharedBuffer.replayAsync(echoAddon, {
			maxSize: maxReplaySize,
			endSequence: replayEndSequence,
		})
	}

	window.addEventListener('resize', handleResize)
	viewport?.addEventListener('resize', handleViewportResize)
	await replayBuffer()
	for (const entry of pendingEntries) {
		printEntry(entry)
	}
	pendingEntries.length = 0
	isReplaying = false
	void startPromptLoop()

	return {
		fit,
		setTheme: (theme: ThemePalette) => {
			setTheme(theme)
		},
		getScrollElement: () => scrollElement,
		getScrollSource: () => scrollSource,
		onScrollTargetsChange: (listener: (targets: ScrollTargets) => void) => {
			scrollTargetListeners.add(listener)
			listener({ scrollElement, scrollSource })
			return () => {
				scrollTargetListeners.delete(listener)
			}
		},
		dispose: () => {
			disposed = true
			if (initialFitRaf !== null) {
				cancelAnimationFrame(initialFitRaf)
				initialFitRaf = null
			}
			clearXtermScrollLookup()
			window.removeEventListener('resize', handleResize)
			viewport?.removeEventListener('resize', handleViewportResize)
			unsubscribeSharedBuffer()
			echoAddon.abortRead('terminal disposed', true)
			echoAddon.dispose()
			fitAddon.dispose()
			bashAdapter.dispose()
			term.dispose()
			scrollElement = null
			scrollSource = null
			scrollTargetListeners.clear()
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
		scrollback: GHOSTTY_SCROLLBACK_LINES,
		convertEol: true,
		cursorBlink: true,
		// Use shared UI scrollbar to keep backend parity.
		scrollbar: false,
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

const createXtermRuntime = (
	theme: ThemePalette,
	rendererType: XtermRenderer = 'webgl'
): TerminalRuntime => {
	const term = new XtermTerminal({
		scrollback: 4294967295, // UInt32 Max for effectively infinite scrollback
		convertEol: true,
		cursorBlink: true,
		fontSize: FONT_SIZE,
		fontFamily: FONT_FAMILY,
		theme: {
			...mapTheme(theme),
		},
		allowProposedApi: true,
	})

	let addon: WebglAddon | CanvasAddon | undefined
	if (rendererType === 'webgl') {
		const webglAddon = new WebglAddon()
		webglAddon.onContextLoss(() => {
			webglAddon.dispose()
		})
		term.loadAddon(webglAddon)
		addon = webglAddon
	} else if (rendererType === 'canvas') {
		addon = new CanvasAddon()
		term.loadAddon(addon)
	}

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

const createXtermScrollSource = (
	term: XtermTerminal,
	getScrollElement: () => HTMLElement | null
): ScrollbarSource => {
	const getScrollSize = () => getScrollElement()?.scrollHeight ?? 0
	const getClientSize = () => getScrollElement()?.clientHeight ?? 0
	const getScrollOffset = () => getScrollElement()?.scrollTop ?? 0
	const setScrollOffset = (offset: number) => {
		const element = getScrollElement()
		if (!element) return
		element.scrollTop = offset
	}
	const scrollBy = (delta: number) => {
		const element = getScrollElement()
		if (!element) return
		element.scrollTop += delta
	}
	const subscribe = (listener: () => void) => {
		let rafId: NodeJS.Timeout | number | null = null
		const schedule = () => {
			if (rafId !== null) return
			const run = () => {
				rafId = null
				listener()
			}
			if (typeof requestAnimationFrame === 'function') {
				rafId = requestAnimationFrame(run)
				return
			}
			rafId = setTimeout(run, 16)
		}

		const disposables = [
			term.onScroll(() => schedule()),
			term.onRender(() => schedule()),
		]

		schedule()

		return () => {
			for (const disposable of disposables) {
				disposable.dispose()
			}
			if (rafId === null) return
			if (typeof cancelAnimationFrame === 'function') {
				cancelAnimationFrame(rafId)
			} else {
				clearTimeout(rafId)
			}
			rafId = null
		}
	}

	return {
		getScrollSize,
		getClientSize,
		getScrollOffset,
		setScrollOffset,
		scrollBy,
		subscribe,
	}
}

const createGhosttyScrollSource = (term: GhosttyTerminal): ScrollbarSource => {
	const getScrollbackLength = () => term.getScrollbackLength()
	const getMaxScroll = () => Math.max(0, getScrollbackLength())
	const getScrollSize = () => getScrollbackLength() + term.rows
	const getClientSize = () => term.rows
	const getScrollOffset = () => {
		const maxScroll = getMaxScroll()
		const offset = maxScroll - term.viewportY
		return Math.max(0, Math.min(maxScroll, offset))
	}
	const setScrollOffset = (offset: number) => {
		const maxScroll = getMaxScroll()
		const nextOffset = Math.max(0, Math.min(maxScroll, offset))
		term.scrollToLine(maxScroll - nextOffset)
	}
	const scrollBy = (delta: number) => {
		const lineHeight =
			term.renderer?.getMetrics()?.height ?? GHOSTTY_SCROLLBAR_LINE_HEIGHT
		const deltaLines = delta / lineHeight
		if (deltaLines !== 0) {
			term.scrollLines(deltaLines)
		}
	}
	const subscribe = (listener: () => void) => {
		let rafId: NodeJS.Timeout | number | null = null
		const schedule = () => {
			if (rafId !== null) return
			const run = () => {
				rafId = null
				listener()
			}
			if (typeof requestAnimationFrame === 'function') {
				rafId = requestAnimationFrame(run)
				return
			}
			rafId = setTimeout(run, 16)
		}

		const disposables = [
			term.onScroll(() => schedule()),
			term.onResize(() => schedule()),
			term.onRender(() => schedule()),
		]

		schedule()

		return () => {
			for (const disposable of disposables) {
				disposable.dispose()
			}
			if (rafId === null) return
			if (typeof cancelAnimationFrame === 'function') {
				cancelAnimationFrame(rafId as number)
			} else {
				clearTimeout(rafId)
			}
			rafId = null
		}
	}

	return {
		getScrollSize,
		getClientSize,
		getScrollOffset,
		setScrollOffset,
		scrollBy,
		subscribe,
	}
}
