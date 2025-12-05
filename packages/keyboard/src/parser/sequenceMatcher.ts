import { equalCombos, normalizeCombo } from './combo'
import { fromEvent } from './events'
import { detectPlatform } from './platform'
import { parseShortcutSequence } from './shortcut'
import type {
	SequenceMatcherOptions,
	ShortcutSequence,
	ShortcutSequenceMatcher
} from './types'

export function createShortcutSequenceMatcher(
	sequence: string | ShortcutSequence,
	options: SequenceMatcherOptions = {}
): ShortcutSequenceMatcher {
	const {
		platform = detectPlatform(),
		timeoutMs = 1000,
		ignoreRepeat = true,
		treatEqualAsDistinct = true
	} = options

	const targetSequence: ShortcutSequence =
		typeof sequence === 'string'
			? parseShortcutSequence(sequence, { platform, treatEqualAsDistinct })
			: sequence.map(normalizeCombo)

	if (targetSequence.length === 0) {
		throw new Error('Shortcut sequences must include at least one combo')
	}

	let index = 0
	let lastTime = 0

	function reset() {
		index = 0
		lastTime = 0
	}

	function handleEvent(e: KeyboardEvent): boolean {
		if (ignoreRepeat && e.repeat) return false

		const now = Date.now()
		if (index > 0 && now - lastTime > timeoutMs) {
			reset()
		}

		const combo = fromEvent(e, { treatEqualAsDistinct })
		lastTime = now

		const expected = targetSequence[index]
		if (expected && equalCombos(expected, combo)) {
			index += 1
			if (index === targetSequence.length) {
				reset()
				return true
			}
			return false
		}

		const first = targetSequence[0]
		if (first && equalCombos(first, combo)) {
			index = 1
			return false
		}

		reset()
		return false
	}

	return { handleEvent, reset }
}
