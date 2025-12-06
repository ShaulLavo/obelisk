import { normalizeCombo } from './combo'
import { formatKeyLabel } from './format'
import { sortModifiers } from './modifierUtils'
import { detectPlatform } from './platform'
import { parseShortcut } from './shortcut'
import type { KeyCombo, Modifier, Platform } from './types'

const modifierLabels: Record<Platform, Record<Modifier, string>> = {
	mac: {
		ctrl: 'Ctrl',
		shift: 'Shift',
		alt: 'Alt',
		meta: 'Meta'
	},
	windows: {
		ctrl: 'Ctrl',
		shift: 'Shift',
		alt: 'Alt',
		meta: 'Win'
	},
	linux: {
		ctrl: 'Ctrl',
		shift: 'Shift',
		alt: 'Alt',
		meta: 'Win'
	}
}

export function resolvePlatformShortcut(
	shortcut: string | KeyCombo,
	platform: Platform = detectPlatform()
): string {
	const combo =
		typeof shortcut === 'string'
			? parseShortcut(shortcut, { platform })
			: normalizeCombo(shortcut)

	const labels = modifierLabels[platform] ?? modifierLabels.windows
	const parts: string[] = []

	for (const mod of sortModifiers(combo.modifiers, platform)) {
		const label = labels[mod]
		if (label) {
			parts.push(label)
		}
	}

	if (combo.key) {
		parts.push(formatKeyLabel(combo.key))
	}

	return parts.join('+')
}
