import type { KeyCombo, Modifier } from './types'

export function normalizeCombo(combo: KeyCombo): KeyCombo {
	return {
		key: combo.key ?? '',
		modifiers: new Set(combo.modifiers)
	}
}

export function equalModifiers(a: Set<Modifier>, b: Set<Modifier>): boolean {
	if (a.size !== b.size) return false
	for (const m of a) {
		if (!b.has(m)) return false
	}
	return true
}

export function equalCombos(a: KeyCombo, b: KeyCombo): boolean {
	return a.key === b.key && equalModifiers(a.modifiers, b.modifiers)
}
