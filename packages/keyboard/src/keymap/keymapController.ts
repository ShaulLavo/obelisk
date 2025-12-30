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
	KeymapControllerOptions,
	KeyRepeatConfig,
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

// Keys that should never trigger repeat (modifiers only)
const MODIFIER_KEYS =
	/^(?:Meta|Control|Alt|Shift|CapsLock|NumLock|ScrollLock|ContextMenu|OS|Dead|Unidentified)$/

// Default key repeat timing
const DEFAULT_REPEAT_INITIAL_DELAY = 300
const DEFAULT_REPEAT_INITIAL_INTERVAL = 80
const DEFAULT_REPEAT_MIN_INTERVAL = 25
const DEFAULT_REPEAT_ACCELERATION_RATE = 0.92
const DEFAULT_REPEAT_ACCELERATION_STEPS = 30

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

	// Key repeat state
	const keyRepeatConfig: KeyRepeatConfig | undefined = options.keyRepeat
	let repeatActiveKey: string | null = null
	let repeatTimeout: ReturnType<typeof setTimeout> | null = null
	let repeatCount = 0
	let repeatLastEvent: KeyboardEvent | null = null

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
			app,
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
			scopesTried: activeScopes.slice(),
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
				;(result as Promise<unknown>).catch((err) => {
					console.error('Keymap command rejected', err)
				})
			}
		} catch (err) {
			console.error('Keymap command failed', err)
		}
	}

	function stopRepeat() {
		if (repeatTimeout) {
			clearTimeout(repeatTimeout)
			repeatTimeout = null
		}
		repeatActiveKey = null
		repeatCount = 0
		repeatLastEvent = null
	}

	function startRepeat(event: KeyboardEvent, executeNow: () => boolean) {
		if (!keyRepeatConfig?.enabled) return false

		const key = event.key

		// Never repeat modifier-only keys
		if (MODIFIER_KEYS.test(key)) {
			return false
		}

		// If a different key is pressed, stop previous repeat
		if (repeatActiveKey !== null && repeatActiveKey !== key) {
			stopRepeat()
		}

		// If this key is already active, ignore (we handle our own repeat)
		if (repeatActiveKey === key) {
			return true // We handled it
		}

		// Execute immediately
		const handled = executeNow()
		if (!handled) {
			return false
		}

		repeatActiveKey = key
		repeatLastEvent = event

		const initialDelay =
			keyRepeatConfig.initialDelay ?? DEFAULT_REPEAT_INITIAL_DELAY
		const initialInterval =
			keyRepeatConfig.initialInterval ?? DEFAULT_REPEAT_INITIAL_INTERVAL
		const minInterval =
			keyRepeatConfig.minInterval ?? DEFAULT_REPEAT_MIN_INTERVAL
		const accelerationRate =
			keyRepeatConfig.accelerationRate ?? DEFAULT_REPEAT_ACCELERATION_RATE
		const accelerationSteps =
			keyRepeatConfig.accelerationSteps ?? DEFAULT_REPEAT_ACCELERATION_STEPS

		// Start repeat after initial delay
		repeatTimeout = setTimeout(() => {
			let currentInterval = initialInterval

			const doRepeat = () => {
				if (repeatActiveKey !== key || !repeatLastEvent) return

				// Re-execute with stored event
				executeNow()
				repeatCount++

				// Accelerate if not at max speed
				if (repeatCount < accelerationSteps) {
					currentInterval = Math.max(
						minInterval,
						currentInterval * accelerationRate
					)
				}

				// Schedule next repeat
				repeatTimeout = setTimeout(doRepeat, currentInterval)
			}

			doRepeat()
		}, initialDelay)

		return true
	}

	function handleKeydown(event: KeyboardEvent): boolean {
		// If key repeat is enabled and this is a native repeat, ignore it
		if (keyRepeatConfig?.enabled && event.repeat) {
			event.preventDefault()
			return true
		}

		const executeCommand = (): boolean => {
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
						context,
					})
					return true
				}

				notifyMiss(match.id)
			}

			return false
		}

		// If key repeat is enabled, use the repeat system
		if (keyRepeatConfig?.enabled) {
			return startRepeat(event, executeCommand)
		}

		// Otherwise just execute normally
		return executeCommand()
	}

	function handleKeyup(event: KeyboardEvent): void {
		// Stop repeat when the active key is released
		if (event.key === repeatActiveKey) {
			stopRepeat()
		}
	}

	const boundKeydownHandler = (event: Event) => {
		if (event.type !== 'keydown') {
			return
		}
		handleKeydown(event as KeyboardEvent)
	}

	const boundKeyupHandler = (event: Event) => {
		if (event.type !== 'keyup') {
			return
		}
		handleKeyup(event as KeyboardEvent)
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
		target.addEventListener('keydown', boundKeydownHandler as EventListener)
		if (keyRepeatConfig?.enabled) {
			target.addEventListener('keyup', boundKeyupHandler as EventListener)
		}

		return () => detach()
	}

	function detach() {
		if (!target) return
		target.removeEventListener('keydown', boundKeydownHandler as EventListener)
		target.removeEventListener('keyup', boundKeyupHandler as EventListener)
		stopRepeat()
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
			return matches.map((match) => match.id)
		}

		throw new Error('bindCommand requires either bindingId or shortcut')
	}

	function bindCommand(descriptor: CommandBindingDescriptor<TContext>) {
		const bindingIds = resolveBindingIds(descriptor)
		const disposers = bindingIds.map((bindingId) =>
			commands.bindCommand({
				scope: descriptor.scope,
				bindingId,
				commandId: descriptor.commandId,
				when: descriptor.when,
				isEnabled: descriptor.isEnabled,
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
		handleKeyup,
		stopRepeat,
		registerKeybinding,
		registerCommand,
		bindCommand,
		setActiveScopes,
		getActiveScopes,
		resetSequences,
		onMatch,
		onExecute,
		onMiss,
	}
}
