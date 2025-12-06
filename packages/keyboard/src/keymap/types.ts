import type {
	ShortcutSequence,
	ShortcutSequenceMatcherOptions
} from '../parser/types'

export type KeybindingOptions = ShortcutSequenceMatcherOptions & {
	label?: string
	priority?: number
	preventDefault?: boolean
	stopPropagation?: boolean
	meta?: Record<string, unknown>
}

export type KeybindingDescriptor = {
	id?: string
	shortcut: string | ShortcutSequence
	options?: KeybindingOptions
}

export type KeybindingSnapshot = {
	id: string
	shortcut: ShortcutSequence
	label?: string
	priority: number
	preventDefault: boolean
	stopPropagation: boolean
	meta?: Record<string, unknown>
}

export type KeybindingRegistration = {
	id: string
	dispose(): void
}

export type KeybindingMatch = {
	id: string
	event: KeyboardEvent
	binding: KeybindingSnapshot
}

export type CommandPredicateContext<TContext> = {
	scope: string
	event: KeyboardEvent
	binding: KeybindingSnapshot
	app: TContext | undefined
}

export type CommandPredicate<TContext> = (
	ctx: CommandPredicateContext<TContext>
) => boolean

export type CommandDescriptor<TContext> = {
	id: string
	run(ctx: CommandPredicateContext<TContext>): void | Promise<void>
	when?: CommandPredicate<TContext>
	isEnabled?: CommandPredicate<TContext>
}

type CommandBindingBase<TContext> = {
	scope: string
	commandId: string
	when?: CommandPredicate<TContext>
	isEnabled?: CommandPredicate<TContext>
}

export type CommandBindingDescriptor<TContext> =
	| (CommandBindingBase<TContext> & {
			bindingId: string
			shortcut?: never
			shortcutOptions?: never
	  })
	| (CommandBindingBase<TContext> & {
			bindingId?: never
			shortcut: string | ShortcutSequence
			shortcutOptions?: ShortcutSequenceMatcherOptions
	  })

export type ScopedCommandBinding<TContext> = {
	scope: string
	bindingId: string
	commandId: string
	when?: CommandPredicate<TContext>
	isEnabled?: CommandPredicate<TContext>
}

export type KeymapControllerOptions<TContext> = {
	contextResolver?: () => TContext | undefined
	initialScopes?: string[]
}
