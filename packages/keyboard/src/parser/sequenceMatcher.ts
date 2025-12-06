import { equalCombos, normalizeCombo } from './combo'
import { fromEvent } from './events'
import { detectPlatform } from './platform'
import { parseShortcutSequence } from './shortcut'
import type {
	ShortcutSequence,
	ShortcutSequenceMatcher,
	ShortcutSequenceMatcherOptions
} from './types'

export function createShortcutSequenceMatcher(
	sequence: string | ShortcutSequence,
	options: ShortcutSequenceMatcherOptions = {}
): ShortcutSequenceMatcher {
	const {
		platform = detectPlatform(),
		timeoutMs = 1000,
		ignoreRepeat = true,
		treatEqualAsDistinct = true,
		allowSubsequence = false
	} = options

	const targetSequence: ShortcutSequence =
		typeof sequence === 'string'
			? parseShortcutSequence(sequence, { platform, treatEqualAsDistinct })
			: sequence.map(normalizeCombo)

	if (targetSequence.length === 0) {
		throw new Error('Shortcut sequences must include at least one combo')
	}

	let index = 0
	let lastStepTime = 0

	function reset() {
		index = 0
		lastStepTime = 0
	}

	function handleEvent(e: KeyboardEvent): boolean {
		if (ignoreRepeat && e.repeat) return false

		const now = Date.now()
		if (index > 0 && now - lastStepTime > timeoutMs) {
			reset()
		}

		const combo = fromEvent(e, { treatEqualAsDistinct })

		const expected = targetSequence[index]
		if (expected && equalCombos(expected, combo)) {
			index += 1
			lastStepTime = now
			if (index === targetSequence.length) {
				reset()
				return true
			}
			return false
		}

		const first = targetSequence[0]
		if (first && equalCombos(first, combo)) {
			index = 1
			lastStepTime = now
			return false
		}

		if (!allowSubsequence) {
			reset()
		}
		return false
	}

	return { handleEvent, reset }
}
