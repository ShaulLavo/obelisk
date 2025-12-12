import { type CommandContext } from './commands'
import type { TerminalPrompt } from './prompt'
export type TerminalController = Awaited<
	ReturnType<typeof createTerminalController>
>
type TerminalControllerOptions = {
	getPrompt: () => TerminalPrompt
	commandContext: Omit<CommandContext, 'localEcho' | 'term'>
}
export declare const createTerminalController: (
	container: HTMLDivElement,
	options: TerminalControllerOptions
) => Promise<{
	fit: () => void
	dispose: () => void
}>
export {}
//# sourceMappingURL=terminalController.d.ts.map
