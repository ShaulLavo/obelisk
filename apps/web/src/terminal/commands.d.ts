import type { Terminal } from 'ghostty-web'
import { FsState } from '~/fs/types'
import type { FsActions } from '../fs/context/FsContext'
import type { LocalEchoController } from './localEcho'
export interface ShellContext {
	state: FsState
	actions: FsActions
	getCwd: () => string
	setCwd: (path: string) => void
}
export interface CommandContext {
	localEcho: LocalEchoController | null
	term: Terminal | null
	shell: ShellContext
}
export declare const handleCommand: (
	input: string,
	ctx: CommandContext
) => Promise<void>
//# sourceMappingURL=commands.d.ts.map
