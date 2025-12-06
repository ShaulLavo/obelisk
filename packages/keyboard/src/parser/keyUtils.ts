import { specialKeyMap, symbolToDigit } from './constants'
import type { ContentKey, DigitKey, LetterKey } from './types'

export type EqualPreference = {
	treatEqualAsDistinct?: boolean
}

export function contentKeyMapper(
	code: string,
	opts: EqualPreference = {}
): ContentKey {
	const treatEqualAsDistinct = opts.treatEqualAsDistinct ?? true
	const c = code.toLowerCase().trim()

	let mapped: ContentKey | null = null

	if (!c) {
		mapped = ''
	} else if (c.length === 1) {
		if (/[a-z]/.test(c)) mapped = c as LetterKey
		else if (/[0-9]/.test(c)) mapped = c as DigitKey
		else if (symbolToDigit[c]) mapped = symbolToDigit[c]
		else if (specialKeyMap[c]) mapped = specialKeyMap[c]
	}

	if (mapped === null && /^key[a-z]$/.test(c)) {
		mapped = c[c.length - 1] as LetterKey
	}

	if (mapped === null && /^digit[0-9]$/.test(c)) {
		mapped = c[c.length - 1] as DigitKey
	}

	if (mapped === null && specialKeyMap[c]) {
		mapped = specialKeyMap[c]
	}

	if (mapped === null) {
		mapped = 'unknown'
	}

	if (!treatEqualAsDistinct && mapped === '=') {
		return '+'
	}

	return mapped
}

export function parseKeyToken(raw: string, opts: EqualPreference = {}): ContentKey {
	const trimmed = raw.trim()
	return contentKeyMapper(trimmed, opts)
}

export function normalizeKey(
	key: string,
	opts: EqualPreference = {}
): ContentKey {
	return contentKeyMapper(key, opts)
}
