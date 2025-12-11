// import { FitAddon } from '@xterm/addon-fit'
import { Terminal as Xterm, init, FitAddon } from 'ghostty-web'
// import { Terminal as Xterm } from '@xterm/xterm'
import { LocalEchoController } from './localEcho'
import { handleCommand } from './commands'

const promptLabel = 'guest@vibe:~$ '

export const createTerminalController = async (container: HTMLDivElement) => {
	let disposed = false
	let initialFitRaf: number | null = null
	await init()
	const term = new Xterm({
		convertEol: true,
		cursorBlink: true,
		fontSize: 14,
		fontFamily: 'JetBrains Mono Variable, monospace',
		theme: {
			background: '#0a0a0b',
			foreground: '#e5e5e5',
			black: '#0b0c0f',
			green: '#cbd5e1',
			white: '#f4f4f5',
			blue: '#d4d4d8',
			cursor: '#e4e4e7',
			brightBlack: '#18181b'
		}
	})

	const fitAddon = new FitAddon()
	const echoAddon = new LocalEchoController()

	term.loadAddon(fitAddon)
	term.loadAddon(echoAddon)

	const startPromptLoop = async () => {
		while (!disposed) {
			try {
				const input = await echoAddon.read(promptLabel)
				handleCommand(input, { localEcho: echoAddon, term })
			} catch {
				break
			}
		}
	}

	const fit = () => {
		if (!disposed) fitAddon.fit()
	}
	const handleResize = () => fit()

	term.open(container)
	{
		// ghostty-web fit needs the container to have final layout (and ideally fonts)
		// before measuring. Doing an initial rAF fit is much more reliable than an
		// immediate sync fit during mount.
		const observeResize = (
			fitAddon as unknown as {
				observeResize?: () => void
			}
		).observeResize
		if (typeof observeResize === 'function') observeResize.call(fitAddon)

		initialFitRaf = requestAnimationFrame(() => {
			fit()
			// 2nd pass to catch late layout/font metric settling
			requestAnimationFrame(fit)
		})
	}
	term.focus()

	echoAddon.println('Welcome to vibe shell')
	echoAddon.println('Type `help` to see available commands.')
	window.addEventListener('resize', handleResize)
	await startPromptLoop()

	return {
		fit,
		dispose: () => {
			disposed = true
			if (initialFitRaf !== null) cancelAnimationFrame(initialFitRaf)
			window.removeEventListener('resize', handleResize)
			echoAddon.abortRead('terminal disposed')
			echoAddon.dispose()
			term.dispose()
		}
	}
}
