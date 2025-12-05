import { normalizeCombo } from './combo'
import { contentKeyMapper, parseKeyToken } from './keyUtils'
import { parseModifiers } from './modifierUtils'
import { detectPlatform } from './platform'
import type { KeyCombo, Modifier, Platform, ShortcutSequence } from './types'

export function parseShortcut(
	s: string,
	opts: { platform?: Platform; treatEqualAsDistinct?: boolean } = {}
): KeyCombo {
	const platform = opts.platform ?? detectPlatform()
	const treatEqualAsDistinct = opts.treatEqualAsDistinct ?? true
	const raw = s.trim().toLowerCase()

	const plusPlusMatch = raw.match(/^(.*)\+\+$/)
	if (plusPlusMatch) {
		const modsToken = (plusPlusMatch[1] ?? '').trim()

		if (modsToken.includes('+')) {
			throw new Error(`Invalid shortcut: ambiguous '+' usage in "${s}"`)
		}

		const modifiers = modsToken
			? parseModifiers(modsToken, platform)
			: new Set<Modifier>()

		return normalizeCombo({ key: '+', modifiers })
	}

	const plusEqualMatch = raw.match(/^(.*)\+\=$/)
	if (plusEqualMatch) {
		const modsToken = (plusEqualMatch[1] ?? '').trim()

		if (modsToken.includes('+')) {
			throw new Error(`Invalid shortcut: ambiguous '+=' usage in "${s}"`)
		}

		const modifiers = modsToken
			? parseModifiers(modsToken, platform)
			: new Set<Modifier>()

		const key = contentKeyMapper('=', { treatEqualAsDistinct })
		return normalizeCombo({ key, modifiers })
	}

	if (/(\+\+|\+=)/.test(raw)) {
		throw new Error(`Invalid shortcut: ambiguous '+' usage in "${s}"`)
	}

	if (raw.includes('+')) {
		const parts = raw
			.split('+')
			.map(p => p.trim())
			.filter(Boolean)

		if (parts.length === 0) {
			return normalizeCombo({
				key: '',
				modifiers: new Set<Modifier>()
			})
		}

		const keyToken = parts[parts.length - 1] ?? ''
		const modsToken = parts.slice(0, -1).join(' ')

		const modifiers = modsToken
			? parseModifiers(modsToken, platform)
			: new Set<Modifier>()

		const key = parseKeyToken(keyToken, { treatEqualAsDistinct })

		return normalizeCombo({ key, modifiers })
	}

	try {
		const modifiers = parseModifiers(raw, platform)
		if (modifiers.size > 0) {
			return normalizeCombo({ key: '', modifiers })
		}
	} catch {
		// fall through to key-only
	}

	const key = parseKeyToken(raw, { treatEqualAsDistinct })
	return normalizeCombo({
		key,
		modifiers: new Set<Modifier>()
	})
}

export function parseShortcutSequence(
	s: string,
	opts: { platform?: Platform; treatEqualAsDistinct?: boolean } = {}
): ShortcutSequence {
	const trimmed = s.trim()
	if (!trimmed) {
		throw new Error('Shortcut sequence cannot be empty')
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch {
		throw new Error(
			`Invalid shortcut sequence syntax: expected JSON array string but got "${s}"`
		)
	}

	if (!Array.isArray(parsed)) {
		throw new Error('Shortcut sequence must be a JSON array of strings')
	}

	if (parsed.length === 0) {
		throw new Error('Shortcut sequence must include at least one shortcut')
	}

	return parsed.map((entry, index) => {
		if (typeof entry !== 'string') {
			throw new Error(
				`Shortcut sequence items must be strings (index ${index} received ${typeof entry})`
			)
		}
		const value = entry.trim()
		if (!value) {
			throw new Error(`Shortcut sequence item at index ${index} is empty`)
		}
		return parseShortcut(value, opts)
	})
}
