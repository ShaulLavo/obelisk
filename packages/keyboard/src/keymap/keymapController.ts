import { createCommandRegistry } from './commandRegistry'
import { createKeybindingRegistry } from './keybindingRegistry'
import type {
	CommandBindingDescriptor,
	CommandDescriptor,
	CommandPredicateContext,
	KeybindingDescriptor,
	KeybindingMatch,
	KeybindingRegistration,
	KeybindingSnapshot,
	KeymapControllerOptions
} from './types'

type KeyboardEventTarget = Pick<
	EventTarget,
	'addEventListener' | 'removeEventListener'
>

type ExecuteListener<TContext> = (payload: {
	commandId: string
	scope: string
	context: CommandPredicateContext<TContext>
}) => void

type MatchListener = (payload: KeybindingMatch) => void

type MissListener = (payload: {
	bindingId: string
	scopesTried: string[]
}) => void

export function createKeymapController<TContext = unknown>(
	options: KeymapControllerOptions<TContext> = {}
) {
	const keybindings = createKeybindingRegistry()
	const commands = createCommandRegistry<TContext>()

	let activeScopes =
		options.initialScopes && options.initialScopes.length > 0
			? options.initialScopes.slice()
			: ['global']
	let target: KeyboardEventTarget | null = null
	const onMatchListeners = new Set<MatchListener>()
	const onExecuteListeners = new Set<ExecuteListener<TContext>>()
	const onMissListeners = new Set<MissListener>()

	function contextFor(
		scope: string,
		binding: KeybindingSnapshot,
		event: KeyboardEvent
	) {
		const app: TContext | undefined = options.contextResolver?.()
		return {
			scope,
			event,
			binding,
			app
		}
	}

	function notifyMatch(match: KeybindingMatch) {
		for (const listener of onMatchListeners) {
			listener(match)
		}
	}

	function notifyExecute(payload: {
		commandId: string
		scope: string
		context: CommandPredicateContext<TContext>
	}) {
		for (const listener of onExecuteListeners) {
			listener(payload)
		}
	}

	function notifyMiss(bindingId: string) {
		if (onMissListeners.size === 0) return
		const payload = {
			bindingId,
			scopesTried: activeScopes.slice()
		}
		for (const listener of onMissListeners) {
			listener(payload)
		}
	}

	function sortMatches(matches: KeybindingMatch[]) {
		return matches.sort((a, b) => b.binding.priority - a.binding.priority)
	}

	function runCommand(
		command: CommandDescriptor<TContext>,
		context: CommandPredicateContext<TContext>
	) {
		try {
			const result = command.run(context)
			if (result && typeof (result as Promise<unknown>).then === 'function') {
				;(result as Promise<unknown>).catch(err => {
					console.error('Keymap command rejected', err)
				})
			}
		} catch (err) {
			console.error('Keymap command failed', err)
		}
	}

	function handleKeydown(event: KeyboardEvent): boolean {
		const matches = keybindings.match(event)
		if (matches.length === 0) {
			return false
		}

		for (const match of matches) {
			notifyMatch(match)
		}

		const orderedMatches = sortMatches(matches)
		for (const match of orderedMatches) {
			const candidates = commands.resolve(match.id, activeScopes)
			if (candidates.length === 0) {
				notifyMiss(match.id)
				continue
			}

			for (const candidate of candidates) {
				const context = contextFor(candidate.scope, match.binding, event)

				if (candidate.bindingWhen && !candidate.bindingWhen(context)) {
					continue
				}
				if (candidate.command.when && !candidate.command.when(context)) {
					continue
				}
				if (
					candidate.bindingIsEnabled &&
					!candidate.bindingIsEnabled(context)
				) {
					continue
				}
				if (
					candidate.command.isEnabled &&
					!candidate.command.isEnabled(context)
				) {
					continue
				}

				if (match.binding.preventDefault) {
					event.preventDefault?.()
				}
				if (match.binding.stopPropagation) {
					event.stopPropagation?.()
				}

				runCommand(candidate.command, context)
				notifyExecute({
					commandId: candidate.command.id,
					scope: candidate.scope,
					context
				})
				return true
			}

			notifyMiss(match.id)
		}

		return false
	}

	const boundHandler = (event: Event) => {
		if (event.type !== 'keydown') {
			return
		}
		handleKeydown(event as KeyboardEvent)
	}

	function attach(targetOverride?: KeyboardEventTarget) {
		const resolved =
			targetOverride ??
			((typeof window !== 'undefined'
				? (window as unknown as KeyboardEventTarget)
				: null) as KeyboardEventTarget | null)

		if (!resolved) {
			throw new Error('No target available for keymap controller attachment')
		}

		if (target) {
			detach()
		}

		target = resolved
		target.addEventListener('keydown', boundHandler as EventListener)

		return () => detach()
	}

	function detach() {
		if (!target) return
		target.removeEventListener('keydown', boundHandler as EventListener)
		target = null
	}

	function registerKeybinding(
		descriptor: KeybindingDescriptor
	): KeybindingRegistration {
		return keybindings.register(descriptor)
	}

	function registerCommand(descriptor: CommandDescriptor<TContext>) {
		return commands.registerCommand(descriptor)
	}

	function resolveBindingIds(
		descriptor: CommandBindingDescriptor<TContext>
	): string[] {
		if (descriptor.bindingId) {
			const snapshot = keybindings.getSnapshot(descriptor.bindingId)
			if (!snapshot) {
				throw new Error(
					`No keybinding registered with id "${descriptor.bindingId}"`
				)
			}
			return [snapshot.id]
		}

		if (descriptor.shortcut) {
			const matches = keybindings.findByShortcut(
				descriptor.shortcut,
				descriptor.shortcutOptions
			)
			if (matches.length === 0) {
				throw new Error(
					`No keybinding registered with shortcut "${descriptor.shortcut}"`
				)
			}
			return matches.map(match => match.id)
		}

		throw new Error('bindCommand requires either bindingId or shortcut')
	}

	function bindCommand(descriptor: CommandBindingDescriptor<TContext>) {
		const bindingIds = resolveBindingIds(descriptor)
		const disposers = bindingIds.map(bindingId =>
			commands.bindCommand({
				scope: descriptor.scope,
				bindingId,
				commandId: descriptor.commandId,
				when: descriptor.when,
				isEnabled: descriptor.isEnabled
			})
		)
		return () => {
			for (const dispose of disposers) {
				dispose()
			}
		}
	}

	function setActiveScopes(scopes: string[]) {
		if (!scopes.length) {
			throw new Error('Keymap controller requires at least one active scope')
		}
		activeScopes = scopes.slice()
		keybindings.reset()
	}

	function getActiveScopes() {
		return activeScopes.slice()
	}

	function onMatch(listener: MatchListener) {
		onMatchListeners.add(listener)
		return () => onMatchListeners.delete(listener)
	}

	function onExecute(listener: ExecuteListener<TContext>) {
		onExecuteListeners.add(listener)
		return () => onExecuteListeners.delete(listener)
	}

	function onMiss(listener: MissListener) {
		onMissListeners.add(listener)
		return () => onMissListeners.delete(listener)
	}

	function resetSequences(bindingId?: string) {
		keybindings.reset(bindingId)
	}

	return {
		attach,
		detach,
		handleKeydown,
		registerKeybinding,
		registerCommand,
		bindCommand,
		setActiveScopes,
		getActiveScopes,
		resetSequences,
		onMatch,
		onExecute,
		onMiss
	}
}
