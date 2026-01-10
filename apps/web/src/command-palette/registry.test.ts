import { describe, expect, it, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import {
	createCommandPaletteRegistry,
	resetCommandPaletteRegistry,
} from './registry'
import { registerBuiltinCommands } from './builtinCommands'
import type { CommandDescriptor, CommandCategory } from './types'

describe('CommandPaletteRegistry', () => {
	let registry: ReturnType<typeof createCommandPaletteRegistry>

	beforeEach(() => {
		// Reset the singleton and create a fresh registry for each test
		resetCommandPaletteRegistry()
		registry = createCommandPaletteRegistry()
	})

	/**
	 * **Feature: command-palette, Property 2: Command Registration Uniqueness**
	 * **Validates: Requirements 4.4**
	 *
	 * For any two commands with the same id, registering the second command SHALL throw an error.
	 */
	it('property: command registration uniqueness', () => {
		fc.assert(
			fc.property(
				// Generate arbitrary command descriptors
				fc.record({
					id: fc.string({ minLength: 1 }),
					label: fc.string({ minLength: 1 }),
					category: fc.constantFrom(
						'File',
						'View',
						'Editor',
						'Navigation',
						'General'
					) as fc.Arbitrary<CommandCategory>,
					shortcut: fc.option(fc.string(), { nil: undefined }),
				}),
				(commandData) => {
					// Clear registry for each iteration to avoid conflicts
					const allCommands = registry.getAll()
					for (const command of allCommands) {
						registry.unregister(command.id)
					}

					const command1: CommandDescriptor = {
						...commandData,
						handler: () => {},
					}
					const command2: CommandDescriptor = {
						...commandData,
						label: commandData.label + '_different',
						handler: () => {},
					}

					// First registration should succeed
					registry.register(command1)

					// Second registration with same id should throw
					expect(() => registry.register(command2)).toThrow()
				}
			),
			{ numRuns: 100 }
		)
	})

	/**
	 * **Feature: command-palette, Property 3: Command Registration Round-Trip**
	 * **Validates: Requirements 4.1, 4.2, 4.3**
	 *
	 * For any valid CommandDescriptor, after registering it with the registry,
	 * calling getAll() SHALL return a list containing a command with matching properties.
	 */
	it('property: command registration round-trip', () => {
		fc.assert(
			fc.property(
				// Generate arbitrary command descriptors
				fc.record({
					id: fc.string({ minLength: 1 }),
					label: fc.string({ minLength: 1 }),
					category: fc.constantFrom(
						'File',
						'View',
						'Editor',
						'Navigation',
						'General'
					) as fc.Arbitrary<CommandCategory>,
					shortcut: fc.option(fc.string(), { nil: undefined }),
				}),
				(commandData) => {
					// Clear registry for each iteration to avoid conflicts
					const allCommands = registry.getAll()
					for (const command of allCommands) {
						registry.unregister(command.id)
					}

					const handler = () => {}
					const command: CommandDescriptor = {
						...commandData,
						handler,
					}

					// Register the command
					registry.register(command)

					// Verify it appears in getAll()
					const allCommands2 = registry.getAll()
					const foundCommand = allCommands2.find((c) => c.id === command.id)

					expect(foundCommand).toBeDefined()
					expect(foundCommand!.id).toBe(command.id)
					expect(foundCommand!.label).toBe(command.label)
					expect(foundCommand!.category).toBe(command.category)
					expect(foundCommand!.shortcut).toBe(command.shortcut)
					expect(foundCommand!.handler).toBe(handler)
				}
			),
			{ numRuns: 100 }
		)
	})

	/**
	 * **Feature: command-palette, Property 4: Command Unregistration**
	 * **Validates: Requirements 4.5**
	 *
	 * For any registered command id, after calling unregister(id),
	 * the command SHALL NOT appear in getAll() results.
	 */
	it('property: command unregistration', () => {
		fc.assert(
			fc.property(
				// Generate arbitrary command descriptors
				fc.record({
					id: fc.string({ minLength: 1 }),
					label: fc.string({ minLength: 1 }),
					category: fc.constantFrom(
						'File',
						'View',
						'Editor',
						'Navigation',
						'General'
					) as fc.Arbitrary<CommandCategory>,
					shortcut: fc.option(fc.string(), { nil: undefined }),
				}),
				(commandData) => {
					// Clear registry for each iteration to avoid conflicts
					const allCommands = registry.getAll()
					for (const command of allCommands) {
						registry.unregister(command.id)
					}

					const command: CommandDescriptor = {
						...commandData,
						handler: () => {},
					}

					// Register the command
					registry.register(command)

					// Verify it's registered
					let allCommands2 = registry.getAll()
					expect(allCommands2.some((c) => c.id === command.id)).toBe(true)

					// Unregister the command
					registry.unregister(command.id)

					// Verify it's no longer in the registry
					allCommands2 = registry.getAll()
					expect(allCommands2.some((c) => c.id === command.id)).toBe(false)
				}
			),
			{ numRuns: 100 }
		)
	})

	/**
	 * Unit test: Built-in commands registration
	 * Verifies that all built-in commands can be registered without conflicts
	 */
	it('should register all built-in commands successfully', () => {
		// Create mock dependencies
		const mockDeps = {
			fs: {
				selectPath: async () => {},
				setViewMode: () => {},
				pickNewRoot: async () => {},
				collapseAll: () => {},
				saveFile: async () => {},
			},
			theme: {
				mode: () => 'light' as const,
				setMode: () => {},
			},
			focus: {
				setActiveArea: () => {},
			},
		}

		// Register built-in commands
		const unregister = registerBuiltinCommands(registry, mockDeps)

		// Verify commands are registered
		const allCommands = registry.getAll()

		// Should have all expected built-in commands
		const expectedCommands = [
			'theme.toggle',
			'fileTree.pickFolder',
			'fileTree.collapseAll',
			'focus.editor',
			'focus.terminal',
			'focus.fileTree',
			'file.save',
			'settings.open',
			'settings.openUI',
			'settings.openJSON',
		]

		for (const expectedId of expectedCommands) {
			const command = allCommands.find((c) => c.id === expectedId)
			expect(command).toBeDefined()
			expect(command!.label).toBeTruthy()
			expect(command!.category).toBeTruthy()
			expect(command!.handler).toBeTypeOf('function')
		}

		// Cleanup
		unregister()

		// Verify commands are unregistered
		const commandsAfterCleanup = registry.getAll()
		for (const expectedId of expectedCommands) {
			expect(
				commandsAfterCleanup.find((c) => c.id === expectedId)
			).toBeUndefined()
		}
	})
})
