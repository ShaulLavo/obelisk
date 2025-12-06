import type {
	CommandDescriptor,
	ScopedCommandBinding
} from './types'

export function createCommandRegistry<TContext>() {
	const commands = new Map<string, CommandDescriptor<TContext>>()
	const scopeBindings = new Map<
		string,
		Map<string, ScopedCommandBinding<TContext>>
	>()

	function registerCommand(descriptor: CommandDescriptor<TContext>) {
		if (commands.has(descriptor.id)) {
			throw new Error(`Command with id "${descriptor.id}" already exists`)
		}
		commands.set(descriptor.id, descriptor)
		return () => commands.delete(descriptor.id)
	}

	function bindCommand(binding: ScopedCommandBinding<TContext>) {
		const scope = scopeBindings.get(binding.scope) ?? new Map()
		scope.set(binding.bindingId, binding)
		scopeBindings.set(binding.scope, scope)

		return () => {
			const scoped = scopeBindings.get(binding.scope)
			scoped?.delete(binding.bindingId)
			if (scoped && scoped.size === 0) {
				scopeBindings.delete(binding.scope)
			}
		}
	}

	function resolve(bindingId: string, scopes: string[]) {
		const matches: Array<{
			scope: string
			command: CommandDescriptor<TContext>
			bindingWhen?: ScopedCommandBinding<TContext>['when']
			bindingIsEnabled?: ScopedCommandBinding<TContext>['isEnabled']
		}> = []
		for (const scope of scopes) {
			const scoped = scopeBindings.get(scope)
			const binding = scoped?.get(bindingId)
			if (!binding) continue
			const command = commands.get(binding.commandId)
			if (!command) continue
			matches.push({
				scope,
				command,
				bindingWhen: binding.when,
				bindingIsEnabled: binding.isEnabled
			})
		}
		return matches
	}

	function getCommand(commandId: string) {
		return commands.get(commandId)
	}

	return {
		registerCommand,
		bindCommand,
		resolve,
		getCommand
	}
}
