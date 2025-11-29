import type { Terminal } from '@xterm/xterm'
import type LocalEchoController from 'local-echo'
import { printColumns } from './utils'

export interface CommandContext {
	localEcho: LocalEchoController | null
	term: Terminal | null
}

export const handleCommand = (input: string, { localEcho, term }: CommandContext) => {
	if (!localEcho || !term) return

	const trimmed = input.trim()
	if (!trimmed) return

	const [command, ...args] = trimmed.split(/\s+/)

	switch (command) {
		case 'help':
			localEcho.println('Available commands:')
			printColumns(localEcho, [
				['help', 'Show this help text'],
				['echo', 'Echo back the provided text'],
				['clear', 'Clear the terminal output']
			])
			break
		case 'echo':
			localEcho.println(args.join(' '))
			break
		case 'clear':
			term.reset()
			break
		default:
			localEcho.println(`Command not found: ${command}`)
	}
}
