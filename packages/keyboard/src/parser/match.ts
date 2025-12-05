import { equalCombos, normalizeCombo } from './combo'
import { fromEvent } from './events'
import { detectPlatform } from './platform'
import { parseShortcut } from './shortcut'
import type { KeyCombo, MatchOptions } from './types'

export function matchShortcut(
	expected: string | KeyCombo,
	e: KeyboardEvent,
	options: MatchOptions = {}
): boolean {
	const platform = options.platform ?? detectPlatform()
	const treatEqualAsDistinct = options.treatEqualAsDistinct ?? true
	if (options.ignoreRepeat !== false && e.repeat) return false

	const expectedCombo =
		typeof expected === 'string'
			? parseShortcut(expected, { platform, treatEqualAsDistinct })
			: normalizeCombo(expected)

	const actual = fromEvent(e, { treatEqualAsDistinct })
	return equalCombos(expectedCombo, actual)
}
