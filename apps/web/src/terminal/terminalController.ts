import { FitAddon } from '@xterm/addon-fit'
import { Terminal as Xterm } from '@xterm/xterm'
import LocalEchoController from 'local-echo'
import { handleCommand } from './commands'

const promptLabel = 'guest@vibe:~$ '

export const createTerminalController = (container: HTMLDivElement) => {
	let disposed = false

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

	const handleResize = () => fitAddon.fit()

	term.open(container)
	fitAddon.fit()
	term.focus()

	echoAddon.println('Welcome to vibe shell')
	echoAddon.println('Type `help` to see available commands.')
	window.addEventListener('resize', handleResize)
	void startPromptLoop()

	return () => {
		disposed = true
		window.removeEventListener('resize', handleResize)
		echoAddon.abortRead('terminal disposed')
		echoAddon.dispose()
		term.dispose()
	}
}
