import { describe, expect, it } from 'bun:test'
import { createKeymapController } from './keymapController'

const baseEvent: KeyboardEvent = {
	key: '',
	code: '',
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	metaKey: false,
	repeat: false
} as KeyboardEvent

function eventFor(
	key: string,
	overrides: Partial<KeyboardEvent> = {}
): KeyboardEvent {
	return { ...baseEvent, key, code: key, ...overrides }
}

describe('createKeymapController', () => {
	it('executes commands registered for a scope when a binding matches', () => {
		const controller = createKeymapController()
		const paletteBinding = controller.registerKeybinding({
			shortcut: 'meta+p'
		})
		const calls: Array<{ scope: string }> = []
		controller.registerCommand({
			id: 'showPalette',
			run: ctx => {
				calls.push({ scope: ctx.scope })
			}
		})
		controller.bindCommand({
			scope: 'global',
			bindingId: paletteBinding.id,
			commandId: 'showPalette'
		})

		const event = eventFor('p', { metaKey: true })
		expect(controller.handleKeydown(event)).toBe(true)
		expect(calls).toEqual([{ scope: 'global' }])
	})

	it('falls through to lower scopes when predicates fail', () => {
		type Context = { focus: 'editor' | 'terminal' }
		const controller = createKeymapController<Context>({
			contextResolver: () => ({ focus: 'editor' }),
			initialScopes: ['terminal', 'global']
		})

		const toggle = controller.registerKeybinding({
			shortcut: 'ctrl+/'
		})

		controller.registerCommand({
			id: 'terminalComment',
			when: ctx => ctx.app?.focus === 'terminal',
			run: () => {
				throw new Error('should not run')
			}
		})

		const globalCalls: string[] = []
		controller.registerCommand({
			id: 'editorComment',
			run: ctx => {
				globalCalls.push(ctx.scope)
			}
		})

		controller.bindCommand({
			scope: 'terminal',
			bindingId: toggle.id,
			commandId: 'terminalComment'
		})

		controller.bindCommand({
			scope: 'global',
			bindingId: toggle.id,
			commandId: 'editorComment'
		})

		const event = eventFor('/', { ctrlKey: true })
		expect(controller.handleKeydown(event)).toBe(true)
		expect(globalCalls).toEqual(['global'])
	})

	it('prevents default when configured on the keybinding', () => {
		const controller = createKeymapController()
		const block = controller.registerKeybinding({
			shortcut: 'ctrl+k',
			options: {
				preventDefault: true
			}
		})

		controller.registerCommand({
			id: 'noop',
			run: () => {}
		})

		controller.bindCommand({
			scope: 'global',
			bindingId: block.id,
			commandId: 'noop'
		})

		let prevented = false
		const event = eventFor('k', {
			ctrlKey: true,
			preventDefault: () => {
				prevented = true
			}
		} as KeyboardEvent)

		expect(controller.handleKeydown(event)).toBe(true)
		expect(prevented).toBe(true)
	})

	it('respects binding priority before scope order', () => {
		const controller = createKeymapController()
		const calls: string[] = []

		const low = controller.registerKeybinding({
			shortcut: 'ctrl+e',
			options: { priority: 0 }
		})
		const high = controller.registerKeybinding({
			shortcut: 'ctrl+e',
			options: { priority: 10 }
		})

		controller.registerCommand({
			id: 'lowCommand',
			run: () => {
				calls.push('low')
			}
		})
		controller.registerCommand({
			id: 'highCommand',
			run: () => {
				calls.push('high')
			}
		})

		controller.bindCommand({
			scope: 'global',
			bindingId: low.id,
			commandId: 'lowCommand'
		})
		controller.bindCommand({
			scope: 'global',
			bindingId: high.id,
			commandId: 'highCommand'
		})

		const event = eventFor('e', { ctrlKey: true })
		expect(controller.handleKeydown(event)).toBe(true)
		expect(calls).toEqual(['high'])
	})

	it('allows binding commands via shortcut with binding-level predicates', () => {
		type Ctx = { allow: boolean }
		let allow = false
		const controller = createKeymapController<Ctx>({
			contextResolver: () => ({ allow })
		})

		controller.registerKeybinding({
			shortcut: 'meta+/'
		})

		const calls: string[] = []
		controller.registerCommand({
			id: 'toggle',
			run: ctx => {
				calls.push(ctx.scope)
			}
		})

		controller.bindCommand({
			scope: 'global',
			commandId: 'toggle',
			shortcut: 'meta+/',
			when: ctx => !!ctx.app?.allow
		})

		expect(controller.handleKeydown(eventFor('/', { metaKey: true }))).toBe(
			false
		)
		allow = true
		expect(controller.handleKeydown(eventFor('/', { metaKey: true }))).toBe(
			true
		)
		expect(calls).toEqual(['global'])
	})
})
