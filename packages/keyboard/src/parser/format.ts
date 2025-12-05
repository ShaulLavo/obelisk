import { normalizeCombo } from './combo'
import { sortModifiers } from './modifierUtils'
import { detectPlatform } from './platform'
import { parseShortcut } from './shortcut'
import type {
	ContentKey,
	FormatOptions,
	KeyCombo,
	Modifier,
	Platform
} from './types'

export function formatShortcut(
	shortcut: string | KeyCombo,
	options: FormatOptions = {}
): string {
	const {
		platform = detectPlatform(),
		useSymbols = true,
		delimiter = ' ',
		treatEqualAsDistinct = true
	} = options

	const combo =
		typeof shortcut === 'string'
			? parseShortcut(shortcut, { platform, treatEqualAsDistinct })
			: normalizeCombo(shortcut)

	const parts: string[] = []

	const mods = sortModifiers(combo.modifiers, platform)
	for (const m of mods) {
		parts.push(formatModifier(m, { platform, useSymbols }))
	}

	if (combo.key) {
		parts.push(formatKeyLabel(combo.key))
	}

	return parts.join(delimiter)
}

export function formatModifier(
	m: Modifier,
	opts: { platform: Platform; useSymbols: boolean }
): string {
	const assertNever = (value: never): never => {
		throw new Error(`Unhandled modifier: ${value}`)
	}
	if (!opts.useSymbols) {
		switch (m) {
			case 'ctrl':
				return 'Ctrl'
			case 'shift':
				return 'Shift'
			case 'alt':
				return 'Alt'
			case 'meta':
				return opts.platform === 'mac' ? 'Cmd' : 'Win'
			default:
				return assertNever(m)
		}
	}

	if (opts.platform === 'mac') {
		switch (m) {
			case 'ctrl':
				return '⌃'
			case 'shift':
				return '⇧'
			case 'alt':
				return '⌥'
			case 'meta':
				return '⌘'
			default:
				return assertNever(m)
		}
	}

	switch (m) {
		case 'ctrl':
			return 'Ctrl'
		case 'shift':
			return 'Shift'
		case 'alt':
			return 'Alt'
		case 'meta':
			return 'Win'
		default:
			return assertNever(m)
	}
}

const labelOverrides: Partial<Record<ContentKey, string>> = {
	space: 'Space',
	tab: 'Tab',
	enter: 'Enter',
	esc: 'Esc',
	capsLock: 'Caps Lock',
	delete: 'Delete'
}

export function formatKeyLabel(key: ContentKey): string {
	if (!key) return ''
	if (labelOverrides[key]) {
		return labelOverrides[key] as string
	}
	if (key.length === 1 && /[a-z]/.test(key)) {
		return key.toUpperCase()
	}
	if (key === 'backquote') return '`'
	if (key === 'contextMenu') return 'Menu'
	return key
}
