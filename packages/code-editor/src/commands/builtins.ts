/**
 * Built-in keydown → EditorCommand mapping.
 *
 * Only commands and navigation go through keydown.
 * Printable text goes through beforeinput/input.
 *
 * Platform detection: isMac is passed at creation time so tests
 * can override it.
 */

import type { EditorCommand } from './EditorCommand'

export type KeyBinding = {
	key: string
	ctrl?: boolean
	meta?: boolean
	shift?: boolean
	alt?: boolean
	/** Command to emit. */
	command: EditorCommand
}

/**
 * Returns the built-in keybinding table for the given platform.
 *
 * Mac uses Meta (Cmd) as the primary modifier.
 * Non-Mac uses Ctrl as the primary modifier.
 */
export const getBuiltinKeyBindings = (isMac: boolean): KeyBinding[] => {
	const primary = isMac ? 'meta' : 'ctrl'

	const mod = (key: string, command: EditorCommand, extra?: Partial<KeyBinding>): KeyBinding => ({
		key,
		[primary]: true,
		...extra,
		command,
	})

	return [
		// History
		mod('z', { type: 'undo' }),
		mod('z', { type: 'redo' }, { shift: true }),
		...(isMac ? [] : [mod('y', { type: 'redo' })]),

		// Selection
		mod('a', { type: 'select-all' }),

		// Clipboard
		mod('c', { type: 'copy' }),
		mod('x', { type: 'cut' }),
		// Paste is handled via beforeinput 'insertFromPaste', not keydown.
		// But we need a keydown binding as a fallback for older browsers.
		// The InputController will prefer the beforeinput path.

		// Save
		mod('s', { type: 'save' }),

		// Indent/Dedent
		{ key: 'Tab', command: { type: 'indent' } },
		{ key: 'Tab', shift: true, command: { type: 'dedent' } },

		// Deletion
		{ key: 'Backspace', command: { type: 'delete-backward', byWord: false } },
		{ key: 'Backspace', [primary]: true, command: { type: 'delete-backward', byWord: true } },
		{ key: 'Delete', command: { type: 'delete-forward', byWord: false } },
		{ key: 'Delete', [primary]: true, command: { type: 'delete-forward', byWord: true } },
		// Alt+Backspace for word delete on Mac
		...(isMac
			? [
					{ key: 'Backspace', alt: true, command: { type: 'delete-backward' as const, byWord: true } },
					{ key: 'Delete', alt: true, command: { type: 'delete-forward' as const, byWord: true } },
				]
			: []),

		// Navigation — arrows
		{ key: 'ArrowLeft', command: { type: 'move-cursor', direction: 'left' as const, byWord: false, extend: false } },
		{ key: 'ArrowRight', command: { type: 'move-cursor', direction: 'right' as const, byWord: false, extend: false } },
		{ key: 'ArrowUp', command: { type: 'move-cursor', direction: 'up' as const, byWord: false, extend: false } },
		{ key: 'ArrowDown', command: { type: 'move-cursor', direction: 'down' as const, byWord: false, extend: false } },

		// Navigation — arrows + shift (extend selection)
		{ key: 'ArrowLeft', shift: true, command: { type: 'move-cursor', direction: 'left' as const, byWord: false, extend: true } },
		{ key: 'ArrowRight', shift: true, command: { type: 'move-cursor', direction: 'right' as const, byWord: false, extend: true } },
		{ key: 'ArrowUp', shift: true, command: { type: 'move-cursor', direction: 'up' as const, byWord: false, extend: true } },
		{ key: 'ArrowDown', shift: true, command: { type: 'move-cursor', direction: 'down' as const, byWord: false, extend: true } },

		// Navigation — arrows + word modifier
		{ key: 'ArrowLeft', [isMac ? 'alt' : primary]: true, command: { type: 'move-cursor', direction: 'left' as const, byWord: true, extend: false } },
		{ key: 'ArrowRight', [isMac ? 'alt' : primary]: true, command: { type: 'move-cursor', direction: 'right' as const, byWord: true, extend: false } },

		// Navigation — arrows + word modifier + shift
		{ key: 'ArrowLeft', [isMac ? 'alt' : primary]: true, shift: true, command: { type: 'move-cursor', direction: 'left' as const, byWord: true, extend: true } },
		{ key: 'ArrowRight', [isMac ? 'alt' : primary]: true, shift: true, command: { type: 'move-cursor', direction: 'right' as const, byWord: true, extend: true } },

		// Home / End
		{ key: 'Home', command: { type: 'move-cursor-home', extend: false, toDocument: false } },
		{ key: 'End', command: { type: 'move-cursor-end', extend: false, toDocument: false } },
		{ key: 'Home', shift: true, command: { type: 'move-cursor-home', extend: true, toDocument: false } },
		{ key: 'End', shift: true, command: { type: 'move-cursor-end', extend: true, toDocument: false } },
		mod('Home', { type: 'move-cursor-home', extend: false, toDocument: true }),
		mod('End', { type: 'move-cursor-end', extend: false, toDocument: true }),
		mod('Home', { type: 'move-cursor-home', extend: true, toDocument: true }, { shift: true }),
		mod('End', { type: 'move-cursor-end', extend: true, toDocument: true }, { shift: true }),

		// Mac: Cmd+Left/Right = Home/End
		...(isMac
			? [
					{ key: 'ArrowLeft', meta: true, command: { type: 'move-cursor-home' as const, extend: false, toDocument: false } },
					{ key: 'ArrowRight', meta: true, command: { type: 'move-cursor-end' as const, extend: false, toDocument: false } },
					{ key: 'ArrowLeft', meta: true, shift: true, command: { type: 'move-cursor-home' as const, extend: true, toDocument: false } },
					{ key: 'ArrowRight', meta: true, shift: true, command: { type: 'move-cursor-end' as const, extend: true, toDocument: false } },
					{ key: 'ArrowUp', meta: true, command: { type: 'move-cursor-home' as const, extend: false, toDocument: true } },
					{ key: 'ArrowDown', meta: true, command: { type: 'move-cursor-end' as const, extend: false, toDocument: true } },
					{ key: 'ArrowUp', meta: true, shift: true, command: { type: 'move-cursor-home' as const, extend: true, toDocument: true } },
					{ key: 'ArrowDown', meta: true, shift: true, command: { type: 'move-cursor-end' as const, extend: true, toDocument: true } },
				]
			: []),

		// Page Up / Page Down
		{ key: 'PageUp', command: { type: 'move-cursor-page', direction: 'up' as const, extend: false } },
		{ key: 'PageDown', command: { type: 'move-cursor-page', direction: 'down' as const, extend: false } },
		{ key: 'PageUp', shift: true, command: { type: 'move-cursor-page', direction: 'up' as const, extend: true } },
		{ key: 'PageDown', shift: true, command: { type: 'move-cursor-page', direction: 'down' as const, extend: true } },

		// Enter — newline
		{ key: 'Enter', command: { type: 'insert-newline' } },
	]
}

/**
 * Match a KeyboardEvent against the keybinding table.
 * Returns the first matching command, or null.
 */
export const matchKeyBinding = (
	bindings: KeyBinding[],
	event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
): EditorCommand | null => {
	for (const binding of bindings) {
		if (binding.key !== event.key) continue
		if ((binding.ctrl ?? false) !== event.ctrlKey) continue
		if ((binding.meta ?? false) !== event.metaKey) continue
		if ((binding.shift ?? false) !== event.shiftKey) continue
		if ((binding.alt ?? false) !== event.altKey) continue
		return binding.command
	}
	return null
}
