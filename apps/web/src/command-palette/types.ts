import type { Component } from 'solid-js'
import type { IconProps } from '@repo/icons'

export type CommandCategory =
	| 'File'
	| 'View'
	| 'Editor'
	| 'Navigation'
	| 'General'

export interface CommandDescriptor {
	id: string
	label: string
	category: CommandCategory
	handler: () => void | Promise<void>
	shortcut?: string // Display only, e.g., "⌘S"
	when?: () => boolean // Conditional availability
	icon?: Component<IconProps> // Optional icon component
}

export interface CommandPaletteRegistry {
	register(command: CommandDescriptor): () => void
	unregister(id: string): void
	getAll(): CommandDescriptor[]
	search(query: string): CommandDescriptor[]
	execute(id: string): Promise<void>
}
