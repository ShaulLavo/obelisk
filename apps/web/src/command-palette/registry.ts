import type { CommandDescriptor, CommandPaletteRegistry } from './types'

class CommandPaletteRegistryImpl implements CommandPaletteRegistry {
	private commands = new Map<string, CommandDescriptor>()

	register(command: CommandDescriptor): () => void {
		if (this.commands.has(command.id)) {
			throw new Error(`Command with id "${command.id}" is already registered`)
		}

		this.commands.set(command.id, command)

		// Return unregister function
		return () => {
			this.unregister(command.id)
		}
	}

	unregister(id: string): void {
		this.commands.delete(id)
	}

	getAll(): CommandDescriptor[] {
		return Array.from(this.commands.values())
	}

	search(query: string): CommandDescriptor[] {
		if (!query.trim()) {
			return this.getAll()
		}

		const lowerQuery = query.toLowerCase()
		return this.getAll().filter(
			(command) =>
				command.label.toLowerCase().includes(lowerQuery) ||
				command.category.toLowerCase().includes(lowerQuery)
		)
	}

	async execute(id: string): Promise<void> {
		const command = this.commands.get(id)
		if (!command) {
			throw new Error(`Command not found: ${id}`)
		}

		if (command.when && !command.when()) {
			throw new Error(`Command "${id}" is not available in current context`)
		}

		await command.handler()
	}
}

// Singleton instance
let registryInstance: CommandPaletteRegistry | null = null

export function getCommandPaletteRegistry(): CommandPaletteRegistry {
	if (!registryInstance) {
		registryInstance = new CommandPaletteRegistryImpl()
	}
	return registryInstance
}

// For testing purposes - allows resetting the singleton
export function resetCommandPaletteRegistry(): void {
	registryInstance = null
}
