import { normalizeCombo } from './combo'
import { normalizeKey } from './keyUtils'
import type { EqualPreference } from './keyUtils'
import type { KeyCombo, Modifier } from './types'

export function fromEvent(
	e: KeyboardEvent,
	opts: EqualPreference = {}
): KeyCombo {
	const treatEqualAsDistinct = opts.treatEqualAsDistinct ?? true
	const modifiers = new Set<Modifier>()
	if (e.ctrlKey) modifiers.add('ctrl')
	if (e.shiftKey) modifiers.add('shift')
	if (e.altKey) modifiers.add('alt')
	if (e.metaKey) modifiers.add('meta')

	const rawKey = (e.key || '').toString()
	const rawCode = (e.code || '').toString()

	let key = normalizeKey(rawKey || rawCode, { treatEqualAsDistinct })

	if (key === 'unknown' && rawKey) {
		const lk = rawKey.toLowerCase()
		if (lk === 'control' || lk === 'shift' || lk === 'alt' || lk === 'meta') {
			key = ''
		} else if (lk === 'contextmenu' || lk === 'apps' || lk === 'menu') {
			key = 'contextMenu'
		}
	}

	return normalizeCombo({
		key,
		modifiers
	})
}
