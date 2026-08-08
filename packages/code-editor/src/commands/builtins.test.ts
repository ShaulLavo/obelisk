import { describe, it, expect } from 'vitest'
import { getBuiltinKeyBindings, matchKeyBinding } from './builtins'

const macBindings = getBuiltinKeyBindings(true)
const winBindings = getBuiltinKeyBindings(false)

const fakeEvent = (key: string, mods?: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }) => ({
	key,
	ctrlKey: mods?.ctrl ?? false,
	metaKey: mods?.meta ?? false,
	shiftKey: mods?.shift ?? false,
	altKey: mods?.alt ?? false,
})

describe('matchKeyBinding', () => {
	describe('mac bindings', () => {
		it('Cmd+Z → undo', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('z', { meta: true }))
			expect(cmd?.type).toBe('undo')
		})

		it('Cmd+Shift+Z → redo', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('z', { meta: true, shift: true }))
			expect(cmd?.type).toBe('redo')
		})

		it('Cmd+A → select-all', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('a', { meta: true }))
			expect(cmd?.type).toBe('select-all')
		})

		it('Cmd+C → copy', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('c', { meta: true }))
			expect(cmd?.type).toBe('copy')
		})

		it('Cmd+S → save', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('s', { meta: true }))
			expect(cmd?.type).toBe('save')
		})

		it('ArrowLeft → move-cursor left', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('ArrowLeft'))
			expect(cmd).toEqual({ type: 'move-cursor', direction: 'left', byWord: false, extend: false })
		})

		it('Shift+ArrowRight → extend selection right', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('ArrowRight', { shift: true }))
			expect(cmd).toEqual({ type: 'move-cursor', direction: 'right', byWord: false, extend: true })
		})

		it('Alt+ArrowLeft → word-level move on Mac', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('ArrowLeft', { alt: true }))
			expect(cmd).toEqual({ type: 'move-cursor', direction: 'left', byWord: true, extend: false })
		})

		it('Cmd+ArrowLeft → home on Mac', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('ArrowLeft', { meta: true }))
			expect(cmd?.type).toBe('move-cursor-home')
		})

		it('Tab → indent', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('Tab'))
			expect(cmd?.type).toBe('indent')
		})

		it('Shift+Tab → dedent', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('Tab', { shift: true }))
			expect(cmd?.type).toBe('dedent')
		})

		it('Enter → insert-newline', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('Enter'))
			expect(cmd?.type).toBe('insert-newline')
		})

		it('unbound key returns null', () => {
			const cmd = matchKeyBinding(macBindings, fakeEvent('q'))
			expect(cmd).toBeNull()
		})
	})

	describe('windows bindings', () => {
		it('Ctrl+Z → undo', () => {
			const cmd = matchKeyBinding(winBindings, fakeEvent('z', { ctrl: true }))
			expect(cmd?.type).toBe('undo')
		})

		it('Ctrl+Y → redo (Windows only)', () => {
			const cmd = matchKeyBinding(winBindings, fakeEvent('y', { ctrl: true }))
			expect(cmd?.type).toBe('redo')
		})

		it('Ctrl+ArrowLeft → word-level move on Windows', () => {
			const cmd = matchKeyBinding(winBindings, fakeEvent('ArrowLeft', { ctrl: true }))
			expect(cmd).toEqual({ type: 'move-cursor', direction: 'left', byWord: true, extend: false })
		})

		it('Cmd+Z does not match on Windows', () => {
			const cmd = matchKeyBinding(winBindings, fakeEvent('z', { meta: true }))
			expect(cmd).toBeNull()
		})
	})
})
